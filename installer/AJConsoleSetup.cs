using System;
using System.ComponentModel;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;

namespace AJConsoleStandalone
{
    static class Program
    {
        [STAThread]
        static void Main(string[] args)
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            bool silent = false;
            foreach (string arg in args)
            {
                if (arg.Equals("/silent", StringComparison.OrdinalIgnoreCase) ||
                    arg.Equals("/quiet", StringComparison.OrdinalIgnoreCase) ||
                    arg.Equals("/auto", StringComparison.OrdinalIgnoreCase) ||
                    arg.Equals("-s", StringComparison.OrdinalIgnoreCase))
                {
                    silent = true;
                }
            }

            if (silent)
            {
                string logPath = Path.Combine(Path.GetTempPath(), "ajconsole_setup.log");
                try { if (File.Exists(logPath)) File.Delete(logPath); } catch {}
                StandaloneEngine engine = new StandaloneEngine(
                    msg => {
                        try { File.AppendAllText(logPath, msg + "\r\n"); } catch {}
                    },
                    (pct, status) => {}
                );
                bool success = engine.Install();
                Environment.Exit(success ? 0 : 1);
            }
            else
            {
                Application.Run(new MainForm());
            }
        }
    }

    public class StandaloneEngine
    {
        private Action<string> _logger;
        private Action<int, string> _progress;

        public StandaloneEngine(Action<string> logger, Action<int, string> progress)
        {
            _logger = logger;
            _progress = progress;
        }

        private void Log(string msg)
        {
            if (_logger != null) _logger(msg);
        }

        private void ReportProgress(int percent, string status)
        {
            if (_progress != null) _progress(percent, status);
        }

        public bool Install()
        {
            try
            {
                Log("==============================================");
                Log(" AJ Console Standalone Setup for Premiere Pro ");
                Log("==============================================");

                // Step 1: Terminate running instances
                ReportProgress(5, "Stopping running overlay services...");
                Log("[1/6] Stopping any running overlay / hook processes...");
                KillProcesses();

                // Step 2: Enable PlayerDebugMode in Registry
                ReportProgress(15, "Enabling Adobe CEP PlayerDebugMode...");
                Log("[2/6] Configuring Windows Registry (CSXS 9-16)...");
                EnablePlayerDebugMode();

                // Step 3: Clean previous destination directories
                ReportProgress(25, "Preparing Adobe extension directories...");
                string cepDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), @"Adobe\CEP\extensions");
                if (!Directory.Exists(cepDir))
                {
                    Directory.CreateDirectory(cepDir);
                }

                string extTarget = Path.Combine(cepDir, "com.fxconsole.premiere");
                string overlayTarget = Path.Combine(cepDir, "overlay");

                Log("[3/6] Cleaning existing installation paths...");
                SafeDelete(extTarget);
                SafeDelete(overlayTarget);

                // Step 4: Extract embedded payload
                ReportProgress(35, "Extracting AJ Console runtime files...");
                Log("[4/6] Extracting embedded payload to %APPDATA%\\Adobe\\CEP\\extensions...");
                ExtractPayload(cepDir);

                // Step 5: Clean up any legacy Windows Startup entry
                ReportProgress(85, "Configuring Premiere-only auto-launch...");
                Log("[5/6] Removing any legacy Windows Startup entries (runs only with Premiere Pro)...");
                CleanupLegacyStartup();

                // Step 6: Start background service ONLY if Premiere Pro is currently running
                ReportProgress(95, "Checking Premiere Pro status...");
                Log("[6/6] Checking if Adobe Premiere Pro is running...");
                StartOverlayIfPremiereRunning(overlayTarget);

                ReportProgress(100, "Installation complete!");
                Log("");
                Log("==============================================");
                Log(" [OK] AJ Console Installed Successfully!");
                Log("==============================================");
                Log("How to use:");
                Log(" 1. Launch Adobe Premiere Pro.");
                Log(" 2. Open Window > Extensions > AJ Console once.");
                Log(" 3. Press Ctrl+Space anywhere in Premiere Pro!");
                Log("==============================================");
                return true;
            }
            catch (Exception ex)
            {
                Log("");
                Log("ERROR during installation: " + ex.Message);
                ReportProgress(0, "Error: " + ex.Message);
                return false;
            }
        }

        public bool Uninstall()
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
                Log("[OK] AJ Console has been completely removed.");
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

            // Use taskkill /F /T first to terminate entire process trees cleanly
            foreach (string pName in procs)
            {
                try
                {
                    ProcessStartInfo psi = new ProcessStartInfo("taskkill", "/F /T /IM " + pName + ".exe");
                    psi.CreateNoWindow = true;
                    psi.UseShellExecute = false;
                    Process tk = Process.Start(psi);
                    if (tk != null) tk.WaitForExit(2500);
                }
                catch {}
            }

            // Double-check and wait until Windows releases all process DLL handles
            for (int attempt = 0; attempt < 15; attempt++)
            {
                bool anyRunning = false;
                foreach (string pName in procs)
                {
                    try
                    {
                        Process[] list = Process.GetProcessesByName(pName);
                        if (list != null && list.Length > 0)
                        {
                            anyRunning = true;
                            foreach (Process p in list)
                            {
                                try { p.Kill(); } catch {}
                                try { p.Dispose(); } catch {}
                            }
                        }
                    }
                    catch {}
                }

                if (!anyRunning) break;
                Thread.Sleep(250);
            }

            // Give Windows a brief moment to release file locks on d3dcompiler_47.dll / exe files
            Thread.Sleep(400);
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
            Log("  -> PlayerDebugMode set to 1 for CSXS.9 through CSXS.16.");
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
                try
                {
                    ProcessStartInfo psi = new ProcessStartInfo("cmd.exe", "/c rmdir /S /Q \"" + path + "\"");
                    psi.CreateNoWindow = true;
                    psi.UseShellExecute = false;
                    Process p = Process.Start(psi);
                    p.WaitForExit(3000);
                }
                catch {}
            }
        }

        private void ExtractPayload(string targetCepDir)
        {
            Assembly asm = Assembly.GetExecutingAssembly();
            Stream zipStream = asm.GetManifestResourceStream("Payload.zip");

            if (zipStream == null)
            {
                // Fallback: check other resource names in assembly
                string[] names = asm.GetManifestResourceNames();
                foreach (string n in names)
                {
                    if (n.EndsWith(".zip", StringComparison.OrdinalIgnoreCase))
                    {
                        zipStream = asm.GetManifestResourceStream(n);
                        break;
                    }
                }
            }

            if (zipStream == null)
            {
                throw new FileNotFoundException("Embedded Payload.zip could not be located in installer assembly.");
            }

            using (zipStream)
            using (ZipArchive archive = new ZipArchive(zipStream, ZipArchiveMode.Read))
            {
                int totalEntries = archive.Entries.Count;
                int extracted = 0;

                foreach (ZipArchiveEntry entry in archive.Entries)
                {
                    string fullPath = Path.Combine(targetCepDir, entry.FullName.Replace('/', '\\'));

                    if (string.IsNullOrEmpty(entry.Name))
                    {
                        // Directory entry
                        if (!Directory.Exists(fullPath))
                        {
                            Directory.CreateDirectory(fullPath);
                        }
                    }
                    else
                    {
                        string dir = Path.GetDirectoryName(fullPath);
                        if (!Directory.Exists(dir))
                        {
                            Directory.CreateDirectory(dir);
                        }

                        entry.ExtractToFile(fullPath, true);
                    }

                    extracted++;
                    if (extracted % 50 == 0 || extracted == totalEntries)
                    {
                        int pct = 35 + (int)((extracted / (double)totalEntries) * 48);
                        ReportProgress(pct, string.Format("Extracting: {0} ({1}/{2})", entry.Name, extracted, totalEntries));
                    }
                }
            }

            Log("  -> All runtime files extracted successfully.");
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
                    Log("  -> Removed legacy Windows Startup entry (service now runs exclusively with Premiere Pro).");
                }
            }
            catch {}
        }

        private void StartOverlayIfPremiereRunning(string overlayDir)
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
                Log("  -> Service is dormant and will start automatically the next time you open Premiere Pro.");
                return;
            }

            string startBat = Path.Combine(overlayDir, "start-overlay.bat");
            if (File.Exists(startBat))
            {
                try
                {
                    ProcessStartInfo psi = new ProcessStartInfo();
                    psi.FileName = startBat;
                    psi.WorkingDirectory = overlayDir;
                    psi.WindowStyle = ProcessWindowStyle.Hidden;
                    psi.UseShellExecute = true;
                    Process.Start(psi);
                    Log("  -> Adobe Premiere Pro is active. Launched background overlay service.");
                    return;
                }
                catch (Exception ex)
                {
                    Log("  start-overlay.bat launch note: " + ex.Message);
                }
            }
        }
    }

    public class MainForm : Form
    {
        private Label lblTitle;
        private Label lblSubtitle;
        private Panel pnlHeader;
        private Panel pnlContent;
        private Panel pnlFooter;
        private ProgressBar progressBar;
        private Label lblStatus;
        private TextBox txtLog;
        private Button btnInstall;
        private Button btnUninstall;
        private Button btnClose;

        private Color clrBg = Color.FromArgb(24, 24, 28);
        private Color clrCard = Color.FromArgb(32, 32, 36);
        private Color clrBorder = Color.FromArgb(48, 48, 56);
        private Color clrPrimary = Color.FromArgb(15, 124, 210);
        private Color clrPrimaryHover = Color.FromArgb(27, 136, 223);
        private Color clrText = Color.FromArgb(224, 224, 224);
        private Color clrMuted = Color.FromArgb(140, 140, 150);

        public MainForm()
        {
            InitializeComponent();
        }

        private void InitializeComponent()
        {
            this.Text = "AJ Console - 1-Click Standalone Installer";
            this.Size = new Size(680, 520);
            this.StartPosition = FormStartPosition.CenterScreen;
            this.FormBorderStyle = FormBorderStyle.FixedSingle;
            this.MaximizeBox = false;
            this.BackColor = clrBg;
            this.ForeColor = clrText;
            this.Font = new Font("Segoe UI", 9.5f, FontStyle.Regular);

            // Header Panel
            pnlHeader = new Panel();
            pnlHeader.Dock = DockStyle.Top;
            pnlHeader.Height = 85;
            pnlHeader.BackColor = clrCard;
            pnlHeader.Paint += (s, e) => {
                using (Pen pen = new Pen(clrBorder, 1))
                {
                    e.Graphics.DrawLine(pen, 0, pnlHeader.Height - 1, pnlHeader.Width, pnlHeader.Height - 1);
                }
            };

            lblTitle = new Label();
            lblTitle.Text = "⚡ AJ Console for Adobe Premiere Pro";
            lblTitle.Font = new Font("Segoe UI Semibold", 15f, FontStyle.Bold);
            lblTitle.ForeColor = Color.White;
            lblTitle.Location = new Point(20, 16);
            lblTitle.AutoSize = true;

            lblSubtitle = new Label();
            lblSubtitle.Text = "Self-Contained 1-Click Setup • Video Copilot FX Console Replica • Global Ctrl+Space HUD";
            lblSubtitle.Font = new Font("Segoe UI", 9f);
            lblSubtitle.ForeColor = clrMuted;
            lblSubtitle.Location = new Point(22, 48);
            lblSubtitle.AutoSize = true;

            pnlHeader.Controls.Add(lblTitle);
            pnlHeader.Controls.Add(lblSubtitle);

            // Footer Panel
            pnlFooter = new Panel();
            pnlFooter.Dock = DockStyle.Bottom;
            pnlFooter.Height = 65;
            pnlFooter.BackColor = clrCard;
            pnlFooter.Paint += (s, e) => {
                using (Pen pen = new Pen(clrBorder, 1))
                {
                    e.Graphics.DrawLine(pen, 0, 0, pnlFooter.Width, 0);
                }
            };

            btnInstall = new Button();
            btnInstall.Text = "⚡ Install AJ Console";
            btnInstall.Font = new Font("Segoe UI Semibold", 10.5f, FontStyle.Bold);
            btnInstall.BackColor = clrPrimary;
            btnInstall.ForeColor = Color.White;
            btnInstall.FlatStyle = FlatStyle.Flat;
            btnInstall.FlatAppearance.BorderSize = 0;
            btnInstall.Size = new Size(190, 40);
            btnInstall.Location = new Point(20, 12);
            btnInstall.Cursor = Cursors.Hand;
            btnInstall.Click += BtnInstall_Click;

            btnUninstall = new Button();
            btnUninstall.Text = "Uninstall";
            btnUninstall.Font = new Font("Segoe UI", 9.5f);
            btnUninstall.BackColor = Color.FromArgb(44, 44, 52);
            btnUninstall.ForeColor = clrMuted;
            btnUninstall.FlatStyle = FlatStyle.Flat;
            btnUninstall.FlatAppearance.BorderSize = 0;
            btnUninstall.Size = new Size(110, 40);
            btnUninstall.Location = new Point(225, 12);
            btnUninstall.Cursor = Cursors.Hand;
            btnUninstall.Click += BtnUninstall_Click;

            btnClose = new Button();
            btnClose.Text = "Close";
            btnClose.Font = new Font("Segoe UI", 9.5f);
            btnClose.BackColor = Color.FromArgb(44, 44, 52);
            btnClose.ForeColor = Color.White;
            btnClose.FlatStyle = FlatStyle.Flat;
            btnClose.FlatAppearance.BorderSize = 0;
            btnClose.Size = new Size(100, 40);
            btnClose.Location = new Point(545, 12);
            btnClose.Cursor = Cursors.Hand;
            btnClose.Click += (s, e) => this.Close();

            pnlFooter.Controls.Add(btnInstall);
            pnlFooter.Controls.Add(btnUninstall);
            pnlFooter.Controls.Add(btnClose);

            // Content Panel
            pnlContent = new Panel();
            pnlContent.Dock = DockStyle.Fill;
            pnlContent.Padding = new Padding(20);

            lblStatus = new Label();
            lblStatus.Text = "Ready to install. Click 'Install AJ Console' to begin.";
            lblStatus.Font = new Font("Segoe UI", 9.5f, FontStyle.Regular);
            lblStatus.ForeColor = Color.FromArgb(200, 200, 210);
            lblStatus.Location = new Point(20, 100);
            lblStatus.Size = new Size(625, 22);

            progressBar = new ProgressBar();
            progressBar.Location = new Point(20, 126);
            progressBar.Size = new Size(625, 14);
            progressBar.Style = ProgressBarStyle.Continuous;
            progressBar.Value = 0;

            txtLog = new TextBox();
            txtLog.Multiline = true;
            txtLog.ReadOnly = true;
            txtLog.ScrollBars = ScrollBars.Vertical;
            txtLog.BackColor = Color.FromArgb(16, 16, 18);
            txtLog.ForeColor = Color.FromArgb(160, 180, 200);
            txtLog.Font = new Font("Consolas", 8.8f);
            txtLog.BorderStyle = BorderStyle.FixedSingle;
            txtLog.Location = new Point(20, 150);
            txtLog.Size = new Size(625, 255);

            this.Controls.Add(txtLog);
            this.Controls.Add(progressBar);
            this.Controls.Add(lblStatus);
            this.Controls.Add(pnlHeader);
            this.Controls.Add(pnlFooter);
        }

        private void AppendLog(string message)
        {
            if (txtLog.InvokeRequired)
            {
                txtLog.Invoke(new Action<string>(AppendLog), message);
                return;
            }
            txtLog.AppendText(message + Environment.NewLine);
        }

        private void SetStatus(int percent, string status)
        {
            if (this.InvokeRequired)
            {
                this.Invoke(new Action<int, string>(SetStatus), percent, status);
                return;
            }
            progressBar.Value = Math.Max(0, Math.Min(100, percent));
            if (!string.IsNullOrEmpty(status))
            {
                lblStatus.Text = status;
            }
        }

        private void SetButtonsEnabled(bool enabled)
        {
            if (this.InvokeRequired)
            {
                this.Invoke(new Action<bool>(SetButtonsEnabled), enabled);
                return;
            }
            btnInstall.Enabled = enabled;
            btnUninstall.Enabled = enabled;
            btnClose.Enabled = enabled;
        }

        private void BtnInstall_Click(object sender, EventArgs e)
        {
            SetButtonsEnabled(false);
            txtLog.Clear();
            progressBar.Value = 0;

            Thread worker = new Thread(() =>
            {
                StandaloneEngine engine = new StandaloneEngine(AppendLog, SetStatus);
                bool success = engine.Install();
                SetButtonsEnabled(true);

                if (success)
                {
                    this.Invoke(new Action(() =>
                    {
                        MessageBox.Show(
                            "AJ Console has been installed successfully!\n\n" +
                            "Next Steps:\n" +
                            "1. Launch Adobe Premiere Pro.\n" +
                            "2. Open Window > Extensions > AJ Console once.\n" +
                            "3. Press Ctrl+Space anywhere in Premiere Pro to search and apply effects!",
                            "AJ Console Installed",
                            MessageBoxButtons.OK,
                            MessageBoxIcon.Information
                        );
                    }));
                }
                else
                {
                    this.Invoke(new Action(() =>
                    {
                        MessageBox.Show(
                            "Installation encountered an error. Please see the log window for details.",
                            "Installation Error",
                            MessageBoxButtons.OK,
                            MessageBoxIcon.Error
                        );
                    }));
                }
            });
            worker.IsBackground = true;
            worker.Start();
        }

        private void BtnUninstall_Click(object sender, EventArgs e)
        {
            DialogResult dr = MessageBox.Show(
                "Are you sure you want to completely remove AJ Console from Premiere Pro?",
                "Confirm Uninstall",
                MessageBoxButtons.YesNo,
                MessageBoxIcon.Question
            );

            if (dr != DialogResult.Yes) return;

            SetButtonsEnabled(false);
            txtLog.Clear();
            progressBar.Value = 0;

            Thread worker = new Thread(() =>
            {
                StandaloneEngine engine = new StandaloneEngine(AppendLog, SetStatus);
                bool success = engine.Uninstall();
                SetButtonsEnabled(true);

                if (success)
                {
                    this.Invoke(new Action(() =>
                    {
                        SetStatus(100, "Uninstalled successfully.");
                        MessageBox.Show(
                            "AJ Console has been completely removed from your system.",
                            "AJ Console Removed",
                            MessageBoxButtons.OK,
                            MessageBoxIcon.Information
                        );
                    }));
                }
            });
            worker.IsBackground = true;
            worker.Start();
        }
    }
}
