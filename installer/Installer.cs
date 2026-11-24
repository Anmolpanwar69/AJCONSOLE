using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;

namespace AJConsoleInstaller
{
    class Program
    {
        [STAThread]
        static void Main(string[] args)
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            bool isSilent = false;
            foreach (string arg in args)
            {
                if (arg.Equals("/silent", StringComparison.OrdinalIgnoreCase) ||
                    arg.Equals("/auto", StringComparison.OrdinalIgnoreCase) ||
                    arg.Equals("-s", StringComparison.OrdinalIgnoreCase))
                {
                    isSilent = true;
                }
            }

            if (isSilent)
            {
                InstallerEngine engine = new InstallerEngine(msg => Console.WriteLine(msg));
                bool ok = engine.RunInstallation(true);
                Environment.Exit(ok ? 0 : 1);
            }
            else
            {
                Application.Run(new InstallerForm());
            }
        }
    }

    public class InstallerEngine
    {
        private Action<string> _logger;
        private string _baseDir;
        private string _logFilePath;

        public InstallerEngine(Action<string> logger)
        {
            _logger = logger;
            _baseDir = AppDomain.CurrentDomain.BaseDirectory;

            // If running inside installer subfolder, go up to workspace root
            if (!Directory.Exists(Path.Combine(_baseDir, "com.fxconsole.premiere")) &&
                Directory.Exists(Path.Combine(_baseDir, "..", "com.fxconsole.premiere")))
            {
                _baseDir = Path.GetFullPath(Path.Combine(_baseDir, ".."));
            }

            _logFilePath = Path.Combine(_baseDir, "installer.log");
        }

        private void Log(string msg)
        {
            try
            {
                File.AppendAllText(_logFilePath, string.Format("[{0:HH:mm:ss}] {1}\r\n", DateTime.Now, msg));
            }
            catch {}

            if (_logger != null) _logger(msg);
        }

        public bool RunInstallation(bool addStartup)
        {
            try
            {
                try { if (File.Exists(_logFilePath)) File.Delete(_logFilePath); } catch {}

                Log("==============================================");
                Log(" Starting AJ Console Setup for Premiere Pro...");
                Log("==============================================");

                // Step 1: Kill running old instances
                Log("[1/6] Stopping any running overlay / hook processes...");
                KillProcesses();

                // Step 2: Enable CEP PlayerDebugMode in Windows Registry
                Log("[2/6] Enabling Adobe CEP Debug Mode (CSXS 9-16)...");
                EnablePlayerDebugMode();

                // Step 3: Install CEP Extension
                Log("[3/6] Installing Adobe CEP extension to %APPDATA%...");
                InstallExtension();

                // Step 4: Install Overlay & Native Hook
                Log("[4/6] Installing AJ Console HUD Overlay & Native Hook...");
                InstallOverlay();

                // Step 5: Remove legacy startup shortcut (service runs strictly with Premiere Pro)
                Log("[5/6] Configuring Premiere-only activation (cleaning legacy Startup)...");
                CleanupLegacyStartup();

                // Step 6: Start services only if Premiere Pro is running
                Log("[6/6] Checking Adobe Premiere Pro status...");
                StartOverlayService();

                Log("");
                Log("==============================================");
                Log(" [OK] AJ Console Installed Successfully!");
                Log("==============================================");
                Log("How to use:");
                Log(" 1. Launch Adobe Premiere Pro.");
                Log(" 2. Open Window > Extensions > AJ Console once.");
                Log(" 3. Press Ctrl+Space anywhere in Premiere Pro to search and apply effects!");
                Log("==============================================");
                return true;
            }
            catch (Exception ex)
            {
                Log("");
                Log("ERROR during installation: " + ex.Message);
                return false;
            }
        }

        public bool RunUninstall()
        {
            try
            {
                Log("==============================================");
                Log(" Uninstalling AJ Console...");
                Log("==============================================");

                KillProcesses();

                string cepDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), @"Adobe\CEP\extensions");
                string extTarget = Path.Combine(cepDir, "com.fxconsole.premiere");
                string overlayTarget = Path.Combine(cepDir, "overlay");

                SafeDelete(extTarget);
                SafeDelete(overlayTarget);

                string startupBat = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Startup), "AJConsole.bat");
                if (File.Exists(startupBat))
                {
                    File.Delete(startupBat);
                    Log("Removed Startup entry.");
                }

                Log("");
                Log("[OK] AJ Console uninstalled successfully.");
                return true;
            }
            catch (Exception ex)
            {
                Log("Uninstall error: " + ex.Message);
                return false;
            }
        }

        private void KillProcesses()
        {
            string[] procs = new string[] { "fxconsole-hook", "electron" };
            foreach (string pName in procs)
            {
                try
                {
                    foreach (Process p in Process.GetProcessesByName(pName))
                    {
                        try { p.Kill(); } catch {}
                    }
                }
                catch {}
            }
            Thread.Sleep(200);
        }

        private void EnablePlayerDebugMode()
        {
            for (int ver = 9; ver <= 16; ver++)
            {
                string keyPath = string.Format(@"Software\Adobe\CSXS.{0}", ver);
                try
                {
                    using (RegistryKey key = Registry.CurrentUser.CreateSubKey(keyPath))
                    {
                        if (key != null)
                        {
                            key.SetValue("PlayerDebugMode", "1", RegistryValueKind.String);
                        }
                    }
                }
                catch {}
            }
            Log("  -> PlayerDebugMode enabled for CSXS 9 through 16.");
        }

        private void InstallExtension()
        {
            string cepDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), @"Adobe\CEP\extensions");
            if (!Directory.Exists(cepDir))
            {
                Directory.CreateDirectory(cepDir);
            }

            string extSource = Path.Combine(_baseDir, "com.fxconsole.premiere");
            string extTarget = Path.Combine(cepDir, "com.fxconsole.premiere");

            if (!Directory.Exists(extSource))
            {
                throw new DirectoryNotFoundException("Extension source directory not found: " + extSource);
            }

            SafeCreateLink(extTarget, extSource);
            Log("  -> Installed extension: " + extTarget);
        }

        private void InstallOverlay()
        {
            string cepDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), @"Adobe\CEP\extensions");
            string overlaySource = Path.Combine(_baseDir, "overlay");
            string overlayTarget = Path.Combine(cepDir, "overlay");

            if (!Directory.Exists(overlaySource))
            {
                throw new DirectoryNotFoundException("Overlay source directory not found: " + overlaySource);
            }

            SafeCreateLink(overlayTarget, overlaySource);
            Log("  -> Installed overlay runtime: " + overlayTarget);
        }

        private void SafeDelete(string path)
        {
            if (!Directory.Exists(path) && !File.Exists(path)) return;
            try
            {
                DirectoryInfo di = new DirectoryInfo(path);
                if ((di.Attributes & FileAttributes.ReparsePoint) != 0)
                {
                    Directory.Delete(path, false);
                    return;
                }
            }
            catch {}

            try
            {
                Directory.Delete(path, true);
            }
            catch
            {
                RunCmd(string.Format("rmdir /S /Q \"{0}\"", path));
            }
        }

        private void SafeCreateLink(string targetPath, string sourcePath)
        {
            SafeDelete(targetPath);

            int exit = RunCmd(string.Format("mklink /J \"{0}\" \"{1}\"", targetPath, sourcePath));
            if (exit != 0 || !Directory.Exists(targetPath))
            {
                Log("  Junction fallback: Copying directory...");
                CopyDirectory(sourcePath, targetPath);
            }
        }

        private void CleanupLegacyStartup()
        {
            try
            {
                string startupFolder = Environment.GetFolderPath(Environment.SpecialFolder.Startup);
                string startupBat = Path.Combine(startupFolder, "AJConsole.bat");
                if (File.Exists(startupBat))
                {
                    File.Delete(startupBat);
                    Log("  -> Removed legacy Windows Startup entry.");
                }
            }
            catch {}
        }

        private void StartOverlayService()
        {
            bool pproRunning = false;
            try
            {
                Process[] procs = Process.GetProcessesByName("Adobe Premiere Pro");
                if (procs != null && procs.Length > 0)
                {
                    pproRunning = true;
                    foreach (var p in procs) { try { p.Dispose(); } catch {} }
                }
            }
            catch {}

            if (!pproRunning)
            {
                Log("  -> Adobe Premiere Pro is currently closed.");
                Log("  -> Service is dormant and will start automatically when Premiere Pro is launched.");
                return;
            }

            string startBat = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), @"Adobe\CEP\extensions\overlay\start-overlay.bat");
            string workingDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), @"Adobe\CEP\extensions\overlay");

            if (!File.Exists(startBat))
            {
                startBat = Path.Combine(_baseDir, @"overlay\start-overlay.bat");
                workingDir = Path.Combine(_baseDir, "overlay");
            }

            if (File.Exists(startBat))
            {
                ProcessStartInfo psi = new ProcessStartInfo();
                psi.FileName = startBat;
                psi.WorkingDirectory = workingDir;
                psi.WindowStyle = ProcessWindowStyle.Hidden;
                psi.UseShellExecute = true;
                Process.Start(psi);
                Log("  -> Premiere Pro is active. Launched background overlay service.");
            }
            else
            {
                Log("  Warning: start-overlay.bat not found at: " + startBat);
            }
        }

        private int RunCmd(string command)
        {
            try
            {
                ProcessStartInfo psi = new ProcessStartInfo("cmd.exe", "/c " + command);
                psi.CreateNoWindow = true;
                psi.UseShellExecute = false;
                Process p = Process.Start(psi);
                p.WaitForExit(3000);
                return p.ExitCode;
            }
            catch
            {
                return -1;
            }
        }

        private void CopyDirectory(string sourceDir, string destinationDir)
        {
            DirectoryInfo dir = new DirectoryInfo(sourceDir);
            DirectoryInfo[] dirs = dir.GetDirectories();

            Directory.CreateDirectory(destinationDir);

            foreach (FileInfo file in dir.GetFiles())
            {
                string targetFilePath = Path.Combine(destinationDir, file.Name);
                file.CopyTo(targetFilePath, true);
            }

            foreach (DirectoryInfo subDir in dirs)
            {
                string newDestinationDir = Path.Combine(destinationDir, subDir.Name);
                CopyDirectory(subDir.FullName, newDestinationDir);
            }
        }
    }

    public class InstallerForm : Form
    {
        private TextBox _logBox;
        private Button _installBtn;
        private Button _uninstallBtn;
        private Button _closeBtn;
        private CheckBox _startupCheck;
        private Label _statusLabel;
        private InstallerEngine _engine;

        public InstallerForm()
        {
            InitializeUI();
            _engine = new InstallerEngine(msg => AppendLog(msg));
        }

        private void InitializeUI()
        {
            this.Text = "AJ Console for Premiere Pro — Setup & 1-Click Installer";
            this.Size = new Size(620, 520);
            this.StartPosition = FormStartPosition.CenterScreen;
            this.FormBorderStyle = FormBorderStyle.FixedDialog;
            this.MaximizeBox = false;
            this.BackColor = Color.FromArgb(24, 24, 28);
            this.ForeColor = Color.FromArgb(235, 235, 240);
            this.Font = new Font("Segoe UI", 9.5f, FontStyle.Regular);

            // Header Panel
            Panel header = new Panel();
            header.Dock = DockStyle.Top;
            header.Height = 70;
            header.BackColor = Color.FromArgb(18, 18, 22);

            Label title = new Label();
            title.Text = "⚡ AJ Console for Adobe Premiere Pro";
            title.Font = new Font("Segoe UI", 15f, FontStyle.Bold);
            title.ForeColor = Color.White;
            title.Location = new Point(18, 12);
            title.AutoSize = true;
            header.Controls.Add(title);

            Label sub = new Label();
            sub.Text = "Video Copilot FX Console Replica for Premiere Pro • Ctrl+Space HUD";
            sub.Font = new Font("Segoe UI", 9f, FontStyle.Regular);
            sub.ForeColor = Color.FromArgb(0, 200, 255);
            sub.Location = new Point(22, 42);
            sub.AutoSize = true;
            header.Controls.Add(sub);

            this.Controls.Add(header);

            // Options
            _startupCheck = new CheckBox();
            _startupCheck.Text = "Launch AJ Console background service automatically on Windows Startup";
            _startupCheck.Checked = true;
            _startupCheck.Location = new Point(22, 82);
            _startupCheck.AutoSize = true;
            _startupCheck.ForeColor = Color.FromArgb(200, 200, 210);
            this.Controls.Add(_startupCheck);

            // Log Box
            _logBox = new TextBox();
            _logBox.Multiline = true;
            _logBox.ReadOnly = true;
            _logBox.ScrollBars = ScrollBars.Vertical;
            _logBox.BackColor = Color.FromArgb(14, 14, 17);
            _logBox.ForeColor = Color.FromArgb(190, 210, 230);
            _logBox.Font = new Font("Consolas", 9f, FontStyle.Regular);
            _logBox.Location = new Point(20, 115);
            _logBox.Size = new Size(565, 290);
            this.Controls.Add(_logBox);

            // Bottom Panel
            _statusLabel = new Label();
            _statusLabel.Text = "Ready to install.";
            _statusLabel.Location = new Point(22, 425);
            _statusLabel.AutoSize = true;
            _statusLabel.ForeColor = Color.FromArgb(150, 150, 160);
            this.Controls.Add(_statusLabel);

            _installBtn = new Button();
            _installBtn.Text = "Install AJ Console";
            _installBtn.Font = new Font("Segoe UI", 10f, FontStyle.Bold);
            _installBtn.BackColor = Color.FromArgb(15, 124, 210);
            _installBtn.ForeColor = Color.White;
            _installBtn.FlatStyle = FlatStyle.Flat;
            _installBtn.FlatAppearance.BorderSize = 0;
            _installBtn.Size = new Size(160, 36);
            _installBtn.Location = new Point(220, 420);
            _installBtn.Cursor = Cursors.Hand;
            _installBtn.Click += (s, e) => StartInstall();
            this.Controls.Add(_installBtn);

            _uninstallBtn = new Button();
            _uninstallBtn.Text = "Uninstall";
            _uninstallBtn.Font = new Font("Segoe UI", 9f);
            _uninstallBtn.BackColor = Color.FromArgb(45, 45, 52);
            _uninstallBtn.ForeColor = Color.FromArgb(220, 100, 100);
            _uninstallBtn.FlatStyle = FlatStyle.Flat;
            _uninstallBtn.FlatAppearance.BorderSize = 0;
            _uninstallBtn.Size = new Size(90, 36);
            _uninstallBtn.Location = new Point(390, 420);
            _uninstallBtn.Cursor = Cursors.Hand;
            _uninstallBtn.Click += (s, e) => StartUninstall();
            this.Controls.Add(_uninstallBtn);

            _closeBtn = new Button();
            _closeBtn.Text = "Close";
            _closeBtn.Font = new Font("Segoe UI", 9f);
            _closeBtn.BackColor = Color.FromArgb(35, 35, 40);
            _closeBtn.ForeColor = Color.FromArgb(180, 180, 190);
            _closeBtn.FlatStyle = FlatStyle.Flat;
            _closeBtn.FlatAppearance.BorderSize = 0;
            _closeBtn.Size = new Size(80, 36);
            _closeBtn.Location = new Point(495, 420);
            _closeBtn.Cursor = Cursors.Hand;
            _closeBtn.Click += (s, e) => this.Close();
            this.Controls.Add(_closeBtn);

            AppendLog("AJ Console Installer Ready.");
            AppendLog("Click 'Install AJ Console' to set up the extension and Ctrl+Space overlay.");
        }

        private void AppendLog(string message)
        {
            if (_logBox.InvokeRequired)
            {
                _logBox.Invoke(new Action<string>(AppendLog), message);
                return;
            }
            _logBox.AppendText(message + Environment.NewLine);
        }

        private void SetStatus(string text, Color color)
        {
            if (_statusLabel.InvokeRequired)
            {
                _statusLabel.Invoke(new Action<string, Color>(SetStatus), text, color);
                return;
            }
            _statusLabel.Text = text;
            _statusLabel.ForeColor = color;
        }

        private void StartInstall()
        {
            _installBtn.Enabled = false;
            _uninstallBtn.Enabled = false;
            _logBox.Clear();
            SetStatus("Installing...", Color.FromArgb(0, 200, 255));

            bool startup = _startupCheck.Checked;

            ThreadPool.QueueUserWorkItem((state) =>
            {
                bool success = _engine.RunInstallation(startup);

                this.Invoke(new Action(() =>
                {
                    _installBtn.Enabled = true;
                    _uninstallBtn.Enabled = true;
                    if (success)
                    {
                        SetStatus("Installation Complete!", Color.FromArgb(78, 201, 112));
                        MessageBox.Show(
                            "AJ Console for Premiere Pro has been installed successfully!\n\n" +
                            "1. Launch Adobe Premiere Pro.\n" +
                            "2. Open Window > Extensions > AJ Console.\n" +
                            "3. Press Ctrl+Space anywhere to search and apply effects instantly!",
                            "AJ Console Setup Complete",
                            MessageBoxButtons.OK,
                            MessageBoxIcon.Information
                        );
                    }
                    else
                    {
                        SetStatus("Installation Failed (check logs).", Color.FromArgb(232, 84, 84));
                    }
                }));
            });
        }

        private void StartUninstall()
        {
            DialogResult res = MessageBox.Show(
                "Are you sure you want to uninstall AJ Console from Adobe Premiere Pro?",
                "Confirm Uninstall",
                MessageBoxButtons.YesNo,
                MessageBoxIcon.Question
            );

            if (res != DialogResult.Yes) return;

            _installBtn.Enabled = false;
            _uninstallBtn.Enabled = false;
            _logBox.Clear();
            SetStatus("Uninstalling...", Color.FromArgb(232, 84, 84));

            ThreadPool.QueueUserWorkItem((state) =>
            {
                bool success = _engine.RunUninstall();
                this.Invoke(new Action(() =>
                {
                    _installBtn.Enabled = true;
                    _uninstallBtn.Enabled = true;
                    SetStatus(success ? "Uninstalled." : "Uninstall Failed.", Color.FromArgb(150, 150, 160));
                }));
            });
        }
    }
}
