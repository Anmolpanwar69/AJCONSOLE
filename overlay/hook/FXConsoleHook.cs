using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace FXConsoleHook
{
    static class Program
    {
        private const int WH_KEYBOARD_LL = 13;
        private const int WM_KEYDOWN = 0x0100;
        private const int WM_KEYUP = 0x0101;
        private const int WM_SYSKEYDOWN = 0x0104;
        private const int WM_SYSKEYUP = 0x0105;

        private const int VK_SPACE = 0x20;
        private const int VK_CONTROL = 0x11;
        private const int VK_LCONTROL = 0xA2;
        private const int VK_RCONTROL = 0xA3;
        private const int VK_F2 = 0x71;
        private const int VK_OEM_3 = 0xC0; // Backtick `

        private static LowLevelKeyboardProc _proc = HookCallback;
        private static IntPtr _hookID = IntPtr.Zero;
        private static long _lastTriggerTick = 0;
        private static bool _ctrlDown = false;

        [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
        private static extern IntPtr SetWindowsHookEx(int idHook, LowLevelKeyboardProc lpfn, IntPtr hMod, uint dwThreadId);

        [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool UnhookWindowsHookEx(IntPtr hhk);

        [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
        private static extern IntPtr CallNextHookEx(IntPtr hhk, int nCode, IntPtr wParam, IntPtr lParam);

        [DllImport("user32.dll")]
        private static extern short GetAsyncKeyState(int vKey);

        [DllImport("user32.dll", SetLastError = true)]
        private static extern IntPtr OpenDesktop(string lpszDesktop, uint dwFlags, bool fInherit, uint dwDesiredAccess);

        [DllImport("user32.dll", SetLastError = true)]
        private static extern bool SetThreadDesktop(IntPtr hDesktop);

        [DllImport("user32.dll")]
        private static extern IntPtr GetThreadDesktop(uint dwThreadId);

        [DllImport("kernel32.dll")]
        private static extern uint GetCurrentThreadId();

        [DllImport("user32.dll", SetLastError = true)]
        private static extern bool GetUserObjectInformation(IntPtr hObj, int nIndex, StringBuilder pvInfo, uint nLength, out uint lpnLengthNeeded);

        [DllImport("user32.dll")]
        private static extern bool AllowSetForegroundWindow(uint dwProcessId);

        [DllImport("user32.dll")]
        private static extern bool SetForegroundWindow(IntPtr hWnd);

        [DllImport("user32.dll")]
        private static extern bool BringWindowToTop(IntPtr hWnd);

        [DllImport("user32.dll")]
        private static extern IntPtr SetFocus(IntPtr hWnd);

        [DllImport("user32.dll")]
        private static extern IntPtr SetActiveWindow(IntPtr hWnd);

        [DllImport("user32.dll")]
        private static extern void SwitchToThisWindow(IntPtr hWnd, bool fAltTab);

        [DllImport("user32.dll")]
        private static extern IntPtr GetForegroundWindow();

        [DllImport("user32.dll")]
        private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

        [DllImport("user32.dll")]
        private static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);

        [DllImport("user32.dll")]
        private static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, int dwExtraInfo);

        [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
        private static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

        [DllImport("user32.dll")]
        private static extern IntPtr FindWindow(string lpClassName, string lpWindowName);

        private const uint DESKTOP_ALL = 0x01FF;
        private const int UOI_NAME = 2;
        private const uint ASFW_ANY = 0xFFFFFFFF;
        private const byte VK_MENU = 0x12; // Alt key
        private const uint KEYEVENTF_KEYUP = 0x0002;

        private delegate IntPtr LowLevelKeyboardProc(int nCode, IntPtr wParam, IntPtr lParam);

        private static void Log(string msg)
        {
            try
            {
                string logFile = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "hook.log");
                File.AppendAllText(logFile, string.Format("[{0:HH:mm:ss.fff}] {1}\r\n", DateTime.Now, msg));
            }
            catch {}
        }

        private static string GetCurrentDesktopName()
        {
            try
            {
                IntPtr hDesk = GetThreadDesktop(GetCurrentThreadId());
                StringBuilder sb = new StringBuilder(256);
                uint len;
                if (GetUserObjectInformation(hDesk, UOI_NAME, sb, 256, out len))
                {
                    return sb.ToString();
                }
            }
            catch {}
            return "unknown";
        }

        [STAThread]
        static void Main(string[] args)
        {
            bool createdNew;
            using (Mutex mutex = new Mutex(true, "Global\\AJConsoleHookSingleInstanceMutex", out createdNew))
            {
                if (!createdNew)
                {
                    Log("Another instance of AJ Console hook is already running. Exiting cleanly.");
                    return;
                }

                string deskName = GetCurrentDesktopName();
                Log("AJ Console Low-Level Hook starting. Desktop: " + deskName);

                // If we are not on the interactive "Default" desktop, attach to it
                if (!deskName.Equals("Default", StringComparison.OrdinalIgnoreCase))
                {
                    Log("Non-Default desktop detected (" + deskName + "). Switching hook thread to 'Default' desktop...");
                    IntPtr hDefaultDesk = OpenDesktop("Default", 0, false, DESKTOP_ALL);
                    if (hDefaultDesk != IntPtr.Zero)
                    {
                        Thread worker = new Thread(() =>
                        {
                            if (SetThreadDesktop(hDefaultDesk))
                            {
                                Log("Worker thread successfully attached to 'Default' desktop. Starting hook...");
                                RunHookLoop();
                            }
                            else
                            {
                                int err = Marshal.GetLastWin32Error();
                                Log("SetThreadDesktop failed with error " + err + ". Falling back to current desktop...");
                                RunHookLoop();
                            }
                        });
                        worker.SetApartmentState(ApartmentState.STA);
                        worker.IsBackground = false;
                        worker.Start();
                        worker.Join();
                        return;
                    }
                    else
                    {
                        int err = Marshal.GetLastWin32Error();
                        Log("OpenDesktop('Default') failed with error " + err + ". Continuing on current desktop.");
                    }
                }

                RunHookLoop();
            }
        }

        private static void RunHookLoop()
        {
            _proc = HookCallback;
            _hookID = SetWindowsHookEx(WH_KEYBOARD_LL, _proc, IntPtr.Zero, 0);

            if (_hookID == IntPtr.Zero)
            {
                int err = Marshal.GetLastWin32Error();
                Log("Failed to install keyboard hook. Win32 Error: " + err);
                return;
            }

            Log("Keyboard hook installed successfully. HookID: " + _hookID);

            Application.ApplicationExit += (s, e) =>
            {
                if (_hookID != IntPtr.Zero)
                {
                    UnhookWindowsHookEx(_hookID);
                    _hookID = IntPtr.Zero;
                    Log("Hook uninstalled on exit.");
                }
            };

            // Monitor Premiere Pro process lifecycle and exit cleanly when Premiere Pro closes
            Thread watcher = new Thread(() =>
            {
                int missingCount = 0;
                bool foundOnce = false;

                while (_hookID != IntPtr.Zero)
                {
                    Thread.Sleep(2500);
                    try
                    {
                        Process[] procs = Process.GetProcessesByName("Adobe Premiere Pro");
                        bool isRunning = (procs != null && procs.Length > 0);
                        if (procs != null)
                        {
                            foreach (var p in procs) { try { p.Dispose(); } catch {} }
                        }

                        if (isRunning)
                        {
                            foundOnce = true;
                            missingCount = 0;
                        }
                        else
                        {
                            missingCount++;
                            if (foundOnce || missingCount >= 6)
                            {
                                Log("Premiere Pro is closed/not running. Exiting hook cleanly.");
                                Application.Exit();
                                break;
                            }
                        }
                    }
                    catch {}
                }
            });
            watcher.IsBackground = true;
            watcher.Start();

            // Run STA message pump with ApplicationContext to keep loop alive indefinitely
            Application.Run(new ApplicationContext());

            if (_hookID != IntPtr.Zero)
            {
                UnhookWindowsHookEx(_hookID);
                _hookID = IntPtr.Zero;
                Log("Hook loop ended.");
            }
        }

        private static bool IsPremiereActive()
        {
            try
            {
                IntPtr hFore = GetForegroundWindow();
                if (hFore == IntPtr.Zero) return false;

                // Check window title for AJ Console Overlay itself
                StringBuilder sbTitle = new StringBuilder(256);
                if (GetWindowText(hFore, sbTitle, 256) > 0)
                {
                    string title = sbTitle.ToString();
                    if (title.IndexOf("AJ Console", StringComparison.OrdinalIgnoreCase) >= 0)
                    {
                        return true;
                    }
                }

                // Check foreground process
                uint pid;
                GetWindowThreadProcessId(hFore, out pid);
                if (pid != 0)
                {
                    using (Process proc = Process.GetProcessById((int)pid))
                    {
                        string pName = proc.ProcessName;
                        if (pName.IndexOf("Premiere", StringComparison.OrdinalIgnoreCase) >= 0)
                        {
                            return true;
                        }

                        if (pName.IndexOf("CEPHtmlEngine", StringComparison.OrdinalIgnoreCase) >= 0)
                        {
                            try
                            {
                                if (proc.MainModule.FileName.IndexOf("Premiere", StringComparison.OrdinalIgnoreCase) >= 0)
                                {
                                    return true;
                                }
                            }
                            catch {}
                        }
                    }
                }
            }
            catch {}

            return false;
        }

        private static IntPtr HookCallback(int nCode, IntPtr wParam, IntPtr lParam)
        {
            if (nCode >= 0)
            {
                int msg = wParam.ToInt32();
                int vkCode = Marshal.ReadInt32(lParam);

                // Track Ctrl key state continuously
                if (vkCode == VK_CONTROL || vkCode == VK_LCONTROL || vkCode == VK_RCONTROL)
                {
                    if (msg == WM_KEYDOWN || msg == WM_SYSKEYDOWN)
                    {
                        _ctrlDown = true;
                    }
                    else if (msg == WM_KEYUP || msg == WM_SYSKEYUP)
                    {
                        _ctrlDown = false;
                    }
                }

                // Check for Ctrl + Space or Ctrl + `
                if (msg == WM_KEYDOWN || msg == WM_SYSKEYDOWN)
                {
                    bool ctrlActive = _ctrlDown ||
                                      (GetAsyncKeyState(VK_CONTROL) & 0x8000) != 0 ||
                                      (GetAsyncKeyState(VK_LCONTROL) & 0x8000) != 0 ||
                                      (GetAsyncKeyState(VK_RCONTROL) & 0x8000) != 0;

                    bool isTargetShortcut = false;

                    if (ctrlActive && (vkCode == VK_SPACE || vkCode == VK_OEM_3))
                    {
                        isTargetShortcut = true;
                    }

                    if (isTargetShortcut)
                    {
                        // CRITICAL: Only trigger if Premiere Pro is the active foreground window!
                        if (!IsPremiereActive())
                        {
                            return CallNextHookEx(_hookID, nCode, wParam, lParam);
                        }

                        long now = Environment.TickCount;
                        if (now - _lastTriggerTick > 250)
                        {
                            _lastTriggerTick = now;
                            Log(string.Format(">>> SHORTCUT DETECTED IN PREMIERE: vk=0x{0:X2} (CtrlActive={1}) -> Triggering AJ Console <<<", vkCode, ctrlActive));

                            // Grant foreground permission so overlay can steal focus cleanly
                            AllowSetForegroundWindow(ASFW_ANY);

                            Task.Run(() => TriggerConsoles());
                        }

                        // CRITICAL: Return 1 to consume the key so Premiere Pro doesn't play video!
                        return (IntPtr)1;
                    }
                }
                else if (msg == WM_KEYUP || msg == WM_SYSKEYUP)
                {
                    // If Space is released while Ctrl was active, also consume keyup ONLY when Premiere Pro is active
                    if (vkCode == VK_SPACE && _ctrlDown)
                    {
                        if (IsPremiereActive())
                        {
                            return (IntPtr)1;
                        }
                    }
                }
            }

            return CallNextHookEx(_hookID, nCode, wParam, lParam);
        }

        private static void TriggerConsoles()
        {
            // 1. Show the floating HUD overlay (Port 39473)
            try
            {
                HttpWebRequest req1 = (HttpWebRequest)WebRequest.Create("http://127.0.0.1:39473/show");
                req1.Method = "POST";
                req1.Timeout = 600;
                req1.ContentLength = 0;
                using (HttpWebResponse resp1 = (HttpWebResponse)req1.GetResponse())
                {
                    if (resp1.StatusCode == HttpStatusCode.OK)
                    {
                        Log("Notified overlay /show successfully.");
                    }
                }
            }
            catch (Exception ex)
            {
                Log("Overlay /show failed: " + ex.Message);
            }

            // 2. Forcibly steal OS keyboard focus away from Premiere Pro's Timeline or any active panel
            Thread.Sleep(35);
            try
            {
                IntPtr hOverlay = FindWindow("Chrome_WidgetWin_1", "AJ Console Overlay");
                if (hOverlay == IntPtr.Zero)
                {
                    hOverlay = FindWindow(null, "AJ Console Overlay");
                }

                if (hOverlay != IntPtr.Zero)
                {
                    IntPtr hFore = GetForegroundWindow();
                    uint unused;
                    uint foreThread = GetWindowThreadProcessId(hFore, out unused);
                    uint targetThread = GetWindowThreadProcessId(hOverlay, out unused);
                    uint currentThread = GetCurrentThreadId();

                    // The Alt-key unlock trick: drops Timeline accelerators & foreground locks
                    keybd_event(VK_MENU, 0, 0, 0);
                    keybd_event(VK_MENU, 0, KEYEVENTF_KEYUP, 0);

                    AllowSetForegroundWindow(ASFW_ANY);

                    if (foreThread != 0 && foreThread != targetThread)
                    {
                        AttachThreadInput(foreThread, targetThread, true);
                        BringWindowToTop(hOverlay);
                        SetForegroundWindow(hOverlay);
                        SetActiveWindow(hOverlay);
                        SetFocus(hOverlay);
                        SwitchToThisWindow(hOverlay, true);
                        AttachThreadInput(foreThread, targetThread, false);
                    }
                    else
                    {
                        BringWindowToTop(hOverlay);
                        SetForegroundWindow(hOverlay);
                        SetActiveWindow(hOverlay);
                        SetFocus(hOverlay);
                        SwitchToThisWindow(hOverlay, true);
                    }
                    Log(string.Format("Forced OS focus from Window {0} (Thread {1}) to Overlay {2} (Thread {3})", hFore, foreThread, hOverlay, targetThread));
                }
                else
                {
                    Log("Warning: AJ Console Overlay window not found.");
                }
            }
            catch (Exception ex)
            {
                Log("Focus transfer error: " + ex.Message);
            }
        }
    }
}
