const http = require('http');

http.get('http://127.0.0.1:8098/json', (res) => {
    let d = '';
    res.on('data', c => d += c);
    res.on('end', () => {
        const pages = JSON.parse(d);
        if (!pages || pages.length === 0) {
            console.log('No CEP pages found on port 8098');
            process.exit(1);
        }
        const wsUrl = pages[0].webSocketDebuggerUrl;
        const ws = new WebSocket(wsUrl);
        ws.onopen = () => {
            const expr = `
                (function() {
                    try {
                        const cp = require('child_process');
                        const path = 'c:\\\\Users\\\\anmol\\\\OneDrive\\\\Documents\\\\Antigravity\\\\FX Console\\\\overlay\\\\hook\\\\fxconsole-hook.exe';
                        const p = cp.spawn(path, [], { detached: true, stdio: 'ignore' });
                        p.unref();
                        return 'Success: spawned PID ' + p.pid;
                    } catch(e) {
                        return 'Error: ' + e.message;
                    }
                })()
            `;
            ws.send(JSON.stringify({
                id: 1,
                method: 'Runtime.evaluate',
                params: { expression: expr, returnByValue: true }
            }));
        };
        ws.onmessage = (m) => {
            const data = JSON.parse(m.data);
            console.log('CEP Response:', data.result ? data.result.result : data);
            ws.close();
            process.exit(0);
        };
    });
});
