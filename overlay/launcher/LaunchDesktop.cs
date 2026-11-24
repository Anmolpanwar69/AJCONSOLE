using System;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;

namespace AJConsoleLauncher
{
    class Program
    {
        [StructLayout(LayoutKind.Sequential)]
        struct STARTUPINFO
        {
            public int cb;
            public string lpReserved;
            public string lpDesktop;
            public string lpTitle;
            public int dwX, dwY, dwXSize, dwYSize, dwXCountChars, dwYCountChars, dwFillAttribute, dwFlags;
            public short wShowWindow, cbReserved2;
            public IntPtr lpReserved2, hStdInput, hStdOutput, hStdError;
        }

        [StructLayout(LayoutKind.Sequential)]
        struct PROCESS_INFORMATION
        {
            public IntPtr hProcess, hThread;
            public int dwProcessId, dwThreadId;
        }

        [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
        static extern bool CreateProcessW(
            string lpApplicationName,
            string lpCommandLine,
            IntPtr lpProcAttr,
            IntPtr lpThreadAttr,
            bool bInherit,
            uint dwFlags,
            IntPtr lpEnv,
            string lpDir,
            ref STARTUPINFO lpSI,
            out PROCESS_INFORMATION lpPI
        );

        [DllImport("kernel32.dll", SetLastError = true)]
        static extern bool CloseHandle(IntPtr hObject);

        static void Main(string[] args)
        {
            string baseDir = @"c:\Users\anmol\OneDrive\Documents\Antigravity\FX Console\overlay";
            string electronExe = Path.Combine(baseDir, @"node_modules\electron\dist\electron.exe");

            if (!File.Exists(electronExe))
            {
                Console.WriteLine("Electron executable not found: " + electronExe);
                return;
            }

            // Command line format: "path/to/electron.exe" "."
            string cmdLine = "\"" + electronExe + "\" \".\"";

            STARTUPINFO si = new STARTUPINFO();
            si.cb = Marshal.SizeOf(si);
            si.lpDesktop = @"Winsta0\Default";

            PROCESS_INFORMATION pi;
            bool success = CreateProcessW(
                electronExe,
                cmdLine,
                IntPtr.Zero,
                IntPtr.Zero,
                false,
                0,
                IntPtr.Zero,
                baseDir,
                ref si,
                out pi
            );

            if (success)
            {
                Console.WriteLine("AJ Console Electron launched on Winsta0\\Default with PID: " + pi.dwProcessId);
                CloseHandle(pi.hThread);
                CloseHandle(pi.hProcess);
            }
            else
            {
                int err = Marshal.GetLastWin32Error();
                Console.WriteLine("CreateProcess failed on Winsta0\\Default. Win32 Error: " + err);
            }
        }
    }
}
