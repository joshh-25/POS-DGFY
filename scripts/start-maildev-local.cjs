const fs = require('fs');
const http = require('http');
const net = require('net');
const path = require('path');

const SMTP_HOST = process.env.MAILDEV_SMTP_HOST || '127.0.0.1';
const SMTP_PORT = Number(process.env.MAILDEV_SMTP_PORT || 1025);
const WEB_HOST = process.env.MAILDEV_WEB_HOST || '127.0.0.1';
const WEB_PORT = Number(process.env.MAILDEV_WEB_PORT || 1080);
const MAX_MESSAGE_BYTES = Number(process.env.MAILDEV_MAX_MESSAGE_BYTES || 1024 * 1024);
const STORAGE_DIR = path.resolve(__dirname, '../.tmp/maildev-local');
const STORAGE_FILE = path.join(STORAGE_DIR, 'messages.jsonl');

const messages = [];

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const appendMessage = (message) => {
  fs.mkdirSync(STORAGE_DIR, { recursive: true });
  fs.appendFileSync(STORAGE_FILE, `${JSON.stringify(message)}\n`);
};

const extractHeader = (raw, name) => {
  const match = raw.match(new RegExp(`^${name}:\\s*(.+)$`, 'im'));
  return match ? match[1].trim() : '';
};

const createMessage = ({ mailFrom, rcptTo, raw }) => {
  const message = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    receivedAt: new Date().toISOString(),
    mailFrom,
    rcptTo,
    subject: extractHeader(raw, 'subject'),
    from: extractHeader(raw, 'from'),
    to: extractHeader(raw, 'to'),
    raw,
  };
  messages.unshift(message);
  appendMessage(message);
  return message;
};

const sendSmtpLine = (socket, line) => {
  socket.write(`${line}\r\n`);
};

const createSmtpSession = (socket) => {
  let buffer = '';
  let dataMode = false;
  let dataBuffer = '';
  let mailFrom = '';
  let rcptTo = [];

  sendSmtpLine(socket, '220 local-maildev ESMTP ready');

  const resetEnvelope = () => {
    mailFrom = '';
    rcptTo = [];
    dataBuffer = '';
    dataMode = false;
  };

  const handleCommand = (line) => {
    const command = line.split(/\s+/, 1)[0].toUpperCase();
    const rest = line.slice(command.length).trim();

    if (dataMode) {
      if (line === '.') {
        const raw = dataBuffer.replace(/\r?\n\.\./g, '\n.');
        createMessage({ mailFrom, rcptTo, raw });
        sendSmtpLine(socket, '250 Message accepted');
        resetEnvelope();
        return;
      }
      dataBuffer += `${line}\n`;
      if (Buffer.byteLength(dataBuffer, 'utf8') > MAX_MESSAGE_BYTES) {
        sendSmtpLine(socket, '552 Message too large');
        resetEnvelope();
      }
      return;
    }

    switch (command) {
      case 'EHLO':
      case 'HELO':
        sendSmtpLine(socket, '250-local-maildev');
        sendSmtpLine(socket, '250 SIZE 1048576');
        break;
      // Local QA accepts SMTP authentication so it can exercise the same
      // Nodemailer configuration path as the application. Credentials are
      // intentionally not validated or stored by this disposable sink.
      case 'AUTH':
        sendSmtpLine(socket, '235 Authentication successful');
        break;
      case 'MAIL':
        mailFrom = rest.replace(/^FROM:\s*/i, '');
        sendSmtpLine(socket, '250 Sender ok');
        break;
      case 'RCPT':
        rcptTo.push(rest.replace(/^TO:\s*/i, ''));
        sendSmtpLine(socket, '250 Recipient ok');
        break;
      case 'DATA':
        if (!mailFrom || rcptTo.length === 0) {
          sendSmtpLine(socket, '503 Need MAIL FROM and RCPT TO first');
          break;
        }
        dataMode = true;
        dataBuffer = '';
        sendSmtpLine(socket, '354 End data with <CR><LF>.<CR><LF>');
        break;
      case 'RSET':
        resetEnvelope();
        sendSmtpLine(socket, '250 Reset ok');
        break;
      case 'NOOP':
        sendSmtpLine(socket, '250 Ok');
        break;
      case 'QUIT':
        sendSmtpLine(socket, '221 Bye');
        socket.end();
        break;
      default:
        sendSmtpLine(socket, '502 Command not implemented');
        break;
    }
  };

  socket.on('data', (chunk) => {
    buffer += chunk.toString('utf8');
    let index = buffer.indexOf('\n');
    while (index !== -1) {
      const line = buffer.slice(0, index).replace(/\r$/, '');
      buffer = buffer.slice(index + 1);
      handleCommand(line);
      index = buffer.indexOf('\n');
    }
  });

  socket.on('error', (error) => {
    if (error.code === 'ECONNRESET' || error.code === 'ECONNABORTED') {
      return;
    }
    console.warn(`[local-maildev] SMTP client error: ${error.code || error.message}`);
  });
};

const renderMessageList = () => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Local MailDev</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 24px; color: #172033; }
    main { max-width: 980px; margin: 0 auto; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border-bottom: 1px solid #d7dde8; padding: 10px; text-align: left; vertical-align: top; }
    th { font-size: 12px; text-transform: uppercase; color: #637083; }
    pre { white-space: pre-wrap; overflow-wrap: anywhere; background: #f6f8fb; padding: 12px; border: 1px solid #d7dde8; }
    a { color: #1454d8; }
  </style>
</head>
<body>
  <main>
    <h1>Local MailDev</h1>
    <p>SMTP: ${escapeHtml(SMTP_HOST)}:${SMTP_PORT}</p>
    <table>
      <thead><tr><th>Received</th><th>From</th><th>To</th><th>Subject</th><th>Raw</th></tr></thead>
      <tbody>
        ${messages.map((message) => `<tr>
          <td>${escapeHtml(message.receivedAt)}</td>
          <td>${escapeHtml(message.from || message.mailFrom)}</td>
          <td>${escapeHtml(message.to || message.rcptTo.join(', '))}</td>
          <td>${escapeHtml(message.subject || '(no subject)')}</td>
          <td><a href="/messages/${encodeURIComponent(message.id)}">Open</a></td>
        </tr>`).join('')}
      </tbody>
    </table>
  </main>
</body>
</html>`;

const renderRawMessage = (message) => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(message.subject || 'Message')}</title>
</head>
<body>
  <p><a href="/">Back</a></p>
  <pre>${escapeHtml(message.raw)}</pre>
</body>
</html>`;

const webServer = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${WEB_HOST}:${WEB_PORT}`);

  if (url.pathname === '/api/messages') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(messages, null, 2));
    return;
  }

  const messageMatch = url.pathname.match(/^\/messages\/([^/]+)$/);
  if (messageMatch) {
    const message = messages.find((entry) => entry.id === decodeURIComponent(messageMatch[1]));
    if (!message) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Message not found');
      return;
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(renderRawMessage(message));
    return;
  }

  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(renderMessageList());
});

const smtpServer = net.createServer(createSmtpSession);

smtpServer.listen(SMTP_PORT, SMTP_HOST, () => {
  console.log(`[local-maildev] SMTP listening on ${SMTP_HOST}:${SMTP_PORT}`);
});

webServer.listen(WEB_PORT, WEB_HOST, () => {
  console.log(`[local-maildev] Web inbox listening on http://${WEB_HOST}:${WEB_PORT}`);
});

const stop = () => {
  smtpServer.close();
  webServer.close();
};

process.on('SIGINT', () => {
  stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  stop();
  process.exit(0);
});
