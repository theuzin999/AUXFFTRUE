using System;
using System.Diagnostics;
using System.Linq;
using System.Runtime.InteropServices;
using System.Threading;

public class Vector3
{
    public float X, Y, Z;
    public Vector3(float x = 0, float y = 0, float z = 0)
    {
        X = x;
        Y = y;
        Z = z;
    }
}

public class Aimbot
{
    [DllImport("kernel32.dll")]
    public static extern IntPtr OpenProcess(int dwDesiredAccess, bool bInheritHandle, int dwProcessId);

    [DllImport("kernel32.dll")]
    public static extern bool ReadProcessMemory(IntPtr hProcess, IntPtr lpBaseAddress, byte[] lpBuffer, int dwSize, ref int lpNumberOfBytesRead);

    [DllImport("kernel32.dll")]
    public static extern bool WriteProcessMemory(IntPtr hProcess, IntPtr lpBaseAddress, byte[] lpBuffer, int nSize, ref int lpNumberOfBytesWritten);

    [DllImport("kernel32.dll")]
    public static extern bool CloseHandle(IntPtr hObject);

    [DllImport("user32.dll")]
    public static extern short GetAsyncKeyState(int vKey);

    private const int PROCESS_ALL_ACCESS = 0x1F0FFF;
    private const int VK_SPACE = 0x20; // Tecla de espaço pra toggle
    private const int VK_LBUTTON = 0x01; // Botão esquerdo do mouse

    private static class Config
    {
        public static bool AimbotActive = false;
        public static float FovRadius = 150.0f; // Raio do campo de visão
        public static float PredictionTime = 0.1f; // Tempo de predição
        public static float SmoothFactor = 8.0f; // Fator de suavização
        public static float RecoilCompensation = 0.05f; // Compensação de recuo
        public static bool AutoFire = true; // Auto-disparo
        public static bool PrioritizeHead = true; // Priorizar cabeça
        public static bool PrioritizeClosest = true; // Priorizar alvos próximos
    }

    public static int GetProcessId(string processName)
    {
        Process[] processes = Process.GetProcessesByName(processName);
        return processes.Length > 0 ? processes[0].Id : 0;
    }

    public static T ReadMemory<T>(IntPtr processHandle, IntPtr address) where T : struct
    {
        int bytesRead = 0;
        byte[] buffer = new byte[Marshal.SizeOf(typeof(T))];
        ReadProcessMemory(processHandle, address, buffer, buffer.Length, ref bytesRead);
        GCHandle handle = GCHandle.Alloc(buffer, GCHandleType.Pinned);
        T value = Marshal.PtrToStructure<T>(handle.AddrOfPinnedObject());
        handle.Free();
        return value;
    }

    public static void WriteMemory<T>(IntPtr processHandle, IntPtr address, T value) where T : struct
    {
        int bytesWritten = 0;
        byte[] buffer = new byte[Marshal.SizeOf(typeof(T))];
        IntPtr ptr = Marshal.AllocHGlobal(buffer.Length);
        Marshal.StructureToPtr(value, ptr, true);
        Marshal.Copy(ptr, buffer, 0, buffer.Length);
        WriteProcessMemory(processHandle, address, buffer, buffer.Length, ref bytesWritten);
        Marshal.FreeHGlobal(ptr);
    }

    public static float Distance(Vector3 a, Vector3 b)
    {
        return (float)Math.Sqrt(Math.Pow(b.X - a.X, 2) + Math.Pow(b.Y - a.Y, 2) + Math.Pow(b.Z - a.Z, 2));
    }

    public static Vector3 PredictMovement(Vector3 enemyPos, Vector3 enemyVel, float deltaTime)
    {
        return new Vector3(
            enemyPos.X + enemyVel.X * deltaTime,
            enemyPos.Y + enemyVel.Y * deltaTime,
            enemyPos.Z + enemyVel.Z * deltaTime
        );
    }

    public static Vector3 SmoothAim(Vector3 currentPos, Vector3 targetPos, float smoothFactor)
    {
        float adjustedSmooth = Math.Max(1.0f, smoothFactor * (1.0f - Config.RecoilCompensation));
        return new Vector3(
            currentPos.X + (targetPos.X - currentPos.X) / adjustedSmooth,
            currentPos.Y + (targetPos.Y - currentPos.Y) / adjustedSmooth,
            currentPos.Z + (targetPos.Z - currentPos.Z) / adjustedSmooth
        );
    }

    public static bool IsAlive(IntPtr processHandle, IntPtr enemyAddress)
    {
        int health = ReadMemory<int>(processHandle, enemyAddress);
        return health > 0;
    }

    public static Vector3 AutoAim(IntPtr processHandle, IntPtr playerBase, IntPtr enemyBase, int numEnemies)
    {
        Vector3 playerPos = ReadMemory<Vector3>(processHandle, playerBase);
        Vector3 bestTarget = new Vector3();
        float closestDistance = Config.FovRadius;
        float highestThreat = 0.0f;

        for (int i = 0; i < numEnemies; i++)
        {
            IntPtr enemyAddress = IntPtr.Add(enemyBase, i * 0x20);
            if (IsAlive(processHandle, enemyAddress))
            {
                Vector3 enemyPos = ReadMemory<Vector3>(processHandle, enemyAddress);
                Vector3 enemyVel = ReadMemory<Vector3>(processHandle, IntPtr.Add(enemyAddress, 0x10));
                Vector3 headPos = Config.PrioritizeHead 
                    ? new Vector3(enemyPos.X, enemyPos.Y + 0.5f, enemyPos.Z) // Ajuste pra cabeça
                    : enemyPos;

                Vector3 predictedPos = PredictMovement(headPos, enemyVel, Config.PredictionTime);
                float distance = Distance(playerPos, predictedPos);

                if (distance < closestDistance)
                {
                    float threatLevel = CalculateThreatLevel(processHandle, enemyAddress, distance);
                    if (Config.PrioritizeClosest || threatLevel > highestThreat)
                    {
                        bestTarget = predictedPos;
                        closestDistance = distance;
                        highestThreat = threatLevel;
                    }
                }
            }
        }

        float dynamicSmooth = closestDistance < 50 ? 4.0f : Config.SmoothFactor;
        return SmoothAim(playerPos, bestTarget, dynamicSmooth);
    }

    private static float CalculateThreatLevel(IntPtr processHandle, IntPtr enemyAddress, float distance)
    {
        int health = ReadMemory<int>(processHandle, enemyAddress);
        int weaponType = ReadMemory<int>(processHandle, IntPtr.Add(enemyAddress, 0x18)); // Supondo que arma está em offset 0x18
        float threat = health > 0 ? 1000.0f / (distance + 1.0f) : 0.0f;
        threat *= (weaponType > 0 ? 1.5f : 1.0f); // Aumenta ameaça se inimigo tem arma
        return threat;
    }

    private static void TriggerAutoFire(IntPtr processHandle, IntPtr aimAddress, Vector3 targetPos)
    {
        if (Config.AutoFire && targetPos.X != 0 && targetPos.Y != 0 && targetPos.Z != 0)
        {
            // Simula clique do mouse (exemplo, requer implementação específica)
            if ((GetAsyncKeyState(VK_LBUTTON) & 0x8000) == 0)
            {
                Console.WriteLine("Auto-disparo ativado!");
            }
        }
    }

    static void Main(string[] args)
    {
        string processName = "FreeFire";
        int processId = GetProcessId(processName);
        if (processId == 0)
        {
            Console.WriteLine("Processo FreeFire não encontrado. Encerrando...");
            return;
        }

        IntPtr processHandle = OpenProcess(PROCESS_ALL_ACCESS, false, processId);
        if (processHandle == IntPtr.Zero)
        {
            Console.WriteLine("Falha ao abrir processo. Encerrando...");
            return;
        }

        IntPtr playerBase = new IntPtr(0x00ABCDEF);
        IntPtr enemyBase = new IntPtr(0x00FEDCBA);
        IntPtr aimAddress = new IntPtr(0x00AABBCC);
        int numEnemies = 20; // Aumentado pra suportar mais inimigos

        while (true)
        {
            if ((GetAsyncKeyState(VK_SPACE) & 0x8000) != 0) // Toggle com espaço
            {
                Config.AimbotActive = !Config.AimbotActive;
                Console.WriteLine(Config.AimbotActive ? "Aimbot ATIVADO!" : "Aimbot DESATIVADO!");
                Thread.Sleep(200); // Debounce
            }

            if (Config.AimbotActive)
            {
                Vector3 aimTarget = AutoAim(processHandle, playerBase, enemyBase, numEnemies);
                AimAtTarget(processHandle, aimAddress, aimTarget);
                TriggerAutoFire(processHandle, aimAddress, aimTarget);
            }

            Thread.Sleep(10); // Loop mais rápido pra maior precisão
        }

        CloseHandle(processHandle);
    }

    private static void AimAtTarget(IntPtr processHandle, IntPtr aimAddress, Vector3 targetPos)
    {
        WriteMemory(processHandle, aimAddress, targetPos);
    }
}