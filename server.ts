import fs from 'fs';
import crypto from 'crypto';
import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { amrClient } from './server/amrClient.js';
import { stateManager } from './server/state.js';

let users: any[] = [];
try {
  users = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'server', 'users.json'), 'utf8'));
} catch (err) {
  console.error('Không thể đọc server/users.json', err);
}

const activeSessions = new Map<string, any>();

const checkAuth = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ success: false, errorCode: 'UNAUTHORIZED', message: 'Vui lòng đăng nhập.' });
    return;
  }
  const token = authHeader.split(' ')[1];
  const user = activeSessions.get(token);
  if (!user) {
    res.status(401).json({ success: false, errorCode: 'INVALID_TOKEN', message: 'Phiên đăng nhập hết hạn.' });
    return;
  }

  (req as any).user = user;
  next();
};

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // --- AUTH ROUTES ---
  app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    const user = users.find(u => u.username === username && u.password === password);
    if (!user) {
      res.status(401).json({ success: false, message: 'Tên đăng nhập hoặc mật khẩu không đúng.' });
      return;
    }
    const token = crypto.randomBytes(16).toString('hex');
    const userData = { username: user.username, permissions: user.permissions };
    activeSessions.set(token, userData);

    res.json({
      success: true,
      data: {
        ...userData,
        token
      }
    });
  });

  // --- API ROUTES FIRST ---

  /**
   * GET /api/config
   * Query params: line, station (optional)
   * Returns config for specific station, or all stations if no params
   */
  app.get('/api/config', (req, res) => {
    try {
      const config = amrClient.getConfig();
      const lineKey = typeof req.query.line === 'string' ? req.query.line.toLowerCase() : undefined;
      const stationKey = typeof req.query.station === 'string' ? req.query.station.toLowerCase() : undefined;

      if (lineKey && stationKey) {
        const line = config.lines[lineKey];
        if (!line) {
          return res.status(404).json({
            success: false,
            errorCode: 'LINE_NOT_FOUND',
            message: `Không tìm thấy cấu hình cho Line '${lineKey}'`,
          });
        }

        const station = line.stations[stationKey];
        if (!station) {
          return res.status(404).json({
            success: false,
            errorCode: 'STATION_NOT_FOUND',
            message: `Không tìm thấy cấu hình cho Station '${stationKey}' thuộc ${line.name}`,
          });
        }

        return res.json({
          success: true,
          data: {
            lineKey,
            stationKey,
            lineName: line.name,
            stationName: station.name,
            stationCode: station.code,
            orderLabel: line.orderLabel || `Lệnh ${line.name}`,
            taskPath: line.taskPath,
            triggers: station.triggers || [],
          },
        });
      }

      // Return full lines and stations hierarchy (for station selection / info)
      return res.json({
        success: true,
        data: {
          lines: Object.entries(config.lines).map(([key, val]) => ({
            key,
            name: val.name,
            orderLabel: val.orderLabel,
            taskPath: val.taskPath,
            stations: Object.entries(val.stations).map(([sKey, sVal]) => ({
              key: sKey,
              code: sVal.code,
              name: sVal.name,
              triggers: sVal.triggers || [],
              url: `/control/${key}/${sKey}`,
            })),
          })),
        },
      });
    } catch (err: any) {
      return res.status(500).json({
        success: false,
        errorCode: 'SERVER_ERROR',
        message: err.message || 'Lỗi đọc cấu hình hệ thống',
      });
    }
  });

  /**
   * GET /api/state
   * Query param: line (optional)
   * Returns shared line lock states for all or a specific line
   */
  app.get('/api/state', (req, res) => {
    try {
      const lineKey = typeof req.query.line === 'string' ? req.query.line.toLowerCase() : undefined;
      if (lineKey) {
        const state = stateManager.getLineState(lineKey);
        return res.json({
          success: true,
          data: {
            line: lineKey,
            ...state,
          },
        });
      }

      return res.json({
        success: true,
        data: stateManager.getAllStates(),
      });
    } catch (err: any) {
      return res.status(500).json({
        success: false,
        errorCode: 'SERVER_ERROR',
        message: err.message || 'Lỗi kiểm tra trạng thái hệ thống',
      });
    }
  });

  /**
   * POST /api/order
   * Body: { line: "line-a", station: "pickup" }
   * Atomic check-and-lock, generates unique timestamp orderId, sends to AMR System
   */
  app.post('/api/order', checkAuth, async (req, res) => {
    const user = (req as any).user;
    const { line: lineKey, station: stationKey } = req.body || {};

    const requiredPath = `/control/${lineKey?.toLowerCase()}/${stationKey?.toLowerCase()}`;
    if (!user.permissions.includes('*') && !user.permissions.includes(requiredPath)) {
      res.status(403).json({ success: false, errorCode: 'FORBIDDEN', message: 'Bạn không có quyền thực hiện trên trạm này.' });
      return;
    }

    if (!lineKey || !stationKey) {
      return res.status(400).json({
        success: false,
        errorCode: 'INVALID_REQUEST',
        message: 'Yêu cầu thiếu tham số line hoặc station.',
      });
    }

    const config = amrClient.getConfig();
    const lineConfig = config.lines[lineKey.toLowerCase()];
    if (!lineConfig) {
      return res.status(404).json({
        success: false,
        errorCode: 'LINE_NOT_FOUND',
        message: `Line '${lineKey}' không tồn tại.`,
      });
    }

    const stationConfig = lineConfig.stations[stationKey.toLowerCase()];
    if (!stationConfig) {
      return res.status(404).json({
        success: false,
        errorCode: 'STATION_NOT_FOUND',
        message: `Station '${stationKey}' không thuộc ${lineConfig.name}.`,
      });
    }

    // Generate unique orderId strictly on backend using the order label as prefix
    const prefix = lineConfig.orderLabel;
    const orderId = stateManager.generateUniqueOrderId(prefix);

    // Atomic try lock to pending state
    const lockResult = stateManager.lockLinePending(lineKey.toLowerCase(), stationKey.toLowerCase(), orderId);
    if (!lockResult.success) {
      stateManager.addLog({
        type: 'ORDER',
        line: lineKey,
        station: stationKey,
        success: false,
        message: `Bị từ chối: ${lockResult.error}`,
      });
      return res.status(409).json({
        success: false,
        errorCode: 'LINE_LOCKED',
        message: lockResult.error,
      });
    }

    // Build actual AMR payload
    const orderPayload = {
      modelProcessCode: config.orderCommon.modelProcessCode,
      priority: config.orderCommon.priority,
      fromSystem: config.orderCommon.fromSystem,
      orderId: orderId,
      taskOrderDetail: [
        {
          taskPath: lineConfig.taskPath,
        },
      ],
    };

    // Send HTTP POST to AMR System
    const amrResult = await amrClient.sendOrder(orderPayload);

    if (!amrResult.success) {
      // Revert lock so line doesn't remain deadlocked on AMR network/rejection error
      stateManager.resetLine(lineKey.toLowerCase());

      stateManager.addLog({
        type: 'ERROR',
        line: lineKey,
        station: stationKey,
        orderId: orderId,
        payload: orderPayload,
        response: amrResult.error,
        success: false,
        message: `Gửi Lệnh thất bại: ${amrResult.error}`,
        durationMs: amrResult.durationMs,
      });

      return res.status(502).json({
        success: false,
        errorCode: 'AMR_FAILED',
        message: amrResult.error || 'AMR System không chấp nhận yêu cầu.',
        orderId: orderId,
        durationMs: amrResult.durationMs,
      });
    }

    // Successful, confirm the state to running
    stateManager.confirmLineRunning(lineKey.toLowerCase());

    stateManager.addLog({
      type: 'ORDER',
      line: lineKey,
      station: stationKey,
      orderId: orderId,
      payload: orderPayload,
      response: amrResult.data,
      success: true,
      message: `Tạo ${lineConfig.orderLabel || lineConfig.name} thành công (${orderId})`,
      durationMs: amrResult.durationMs,
    });

    return res.json({
      success: true,
      orderId: orderId,
      line: lineKey,
      station: stationKey,
      message: `Đã gửi ${lineConfig.orderLabel || 'Lệnh'} thành công tới AMR System.`,
      durationMs: amrResult.durationMs,
      amrResponse: amrResult.data,
    });
  });

  /**
   * POST /api/trigger
   * Body: { line: "line-a", station: "pickup" }
   * Sends trigger with currentStation of the station
   */
  app.post('/api/trigger', checkAuth, async (req, res) => {
    const user = (req as any).user;
    const { line: lineKey, station: stationKey, triggerId } = req.body || {};

    const requiredPath = `/control/${lineKey?.toLowerCase()}/${stationKey?.toLowerCase()}`;
    if (!user.permissions.includes('*') && !user.permissions.includes(requiredPath)) {
      res.status(403).json({ success: false, errorCode: 'FORBIDDEN', message: 'Bạn không có quyền thực hiện trên trạm này.' });
      return;
    }

    if (!lineKey || !stationKey || !triggerId) {
      return res.status(400).json({
        success: false,
        errorCode: 'INVALID_REQUEST',
        message: 'Yêu cầu thiếu tham số line, station hoặc triggerId.',
      });
    }

    const config = amrClient.getConfig();
    const lineConfig = config.lines[lineKey.toLowerCase()];
    if (!lineConfig) {
      return res.status(404).json({
        success: false,
        errorCode: 'LINE_NOT_FOUND',
        message: `Line '${lineKey}' không tồn tại.`,
      });
    }

    const stationConfig = lineConfig.stations[stationKey.toLowerCase()];
    if (!stationConfig) {
      return res.status(404).json({
        success: false,
        errorCode: 'STATION_NOT_FOUND',
        message: `Station '${stationKey}' không tồn tại.`,
      });
    }

    const triggerConfig = stationConfig.triggers.find(t => t.id === triggerId);
    if (!triggerConfig) {
      return res.status(404).json({
        success: false,
        errorCode: 'TRIGGER_NOT_FOUND',
        message: `Trigger '${triggerId}' không tồn tại trong trạm này.`,
      });
    }

    const triggerPayload = {
      currentStation: triggerConfig.triggerStation,
    };

    const triggerResult = await amrClient.sendTrigger(triggerPayload);

    if (!triggerResult.success) {
      stateManager.addLog({
        type: 'ERROR',
        line: lineKey,
        station: stationKey,
        payload: triggerPayload,
        response: triggerResult.error,
        success: false,
        message: `Trigger điểm ${stationConfig.triggerStation} thất bại: ${triggerResult.error}`,
        durationMs: triggerResult.durationMs,
      });

      return res.status(502).json({
        success: false,
        errorCode: 'TRIGGER_FAILED',
        message: triggerResult.error || 'Gửi Trigger thất bại.',
        currentStation: stationConfig.triggerStation,
        durationMs: triggerResult.durationMs,
      });
    }

    stateManager.addLog({
      type: 'TRIGGER',
      line: lineKey,
      station: stationKey,
      payload: triggerPayload,
      response: triggerResult.data,
      success: true,
      message: `Kích hoạt Trigger điểm ${stationConfig.triggerStation} (${stationConfig.code}) thành công`,
      durationMs: triggerResult.durationMs,
    });

    return res.json({
      success: true,
      currentStation: stationConfig.triggerStation,
      stationCode: stationConfig.code,
      message: `Trigger điểm ${stationConfig.triggerStation} thành công.`,
      durationMs: triggerResult.durationMs,
      amrResponse: triggerResult.data,
    });
  });

  /**
   * POST /api/line/reset
   * Body: { line: "line-a" }
   * Manual reset to IDLE (Decision 1 Option A)
   */
  app.post('/api/line/reset', checkAuth, (req, res) => {
    const user = (req as any).user;
    const { line: lineKey } = req.body || {};

    if (!user.permissions.includes('*')) {
      res.status(403).json({ success: false, errorCode: 'FORBIDDEN', message: 'Chỉ Admin mới có quyền mở khóa Line.' });
      return;
    }

    if (!lineKey) {
      return res.status(400).json({
        success: false,
        errorCode: 'INVALID_REQUEST',
        message: 'Yêu cầu thiếu tham số line.',
      });
    }

    const result = stateManager.resetLine(lineKey.toLowerCase());
    if (!result.success) {
      return res.status(404).json({
        success: false,
        errorCode: 'LINE_NOT_FOUND',
        message: result.message,
      });
    }

    return res.json({
      success: true,
      message: result.message,
      line: lineKey,
    });
  });

  /**
   * POST /api/webhook/rcs
   * Webhook to receive status updates from RCS (Auto-reset line when completed)
   * Expected Payload: { orderId: "...", status: "COMPLETED" | "STARTED" | "FAILED" }
   */
  app.post('/api/rcs', (req, res) => {
    console.log(req.body);
    try {
      const { orderId, status, errorDesc } = req.body || {};

      const sendSuccess = () => res.json({ "code": 1000, "desc": "success" });

      if (!orderId) {
        return res.status(400).json({ success: false, message: "Thiếu orderId" });
      }

      const allStates = stateManager.getAllStates();
      let targetLine: string | null = null;

      for (const [lineKey, state] of Object.entries(allStates)) {
        if (state.currentOrderId === orderId) {
          targetLine = lineKey;
          break;
        }
      }

      if (!targetLine) {
        return res.status(404).json({ success: false, message: "Không tìm thấy line đang chạy lệnh này" });
      }

      if (status == 8) {
        stateManager.resetLine(targetLine);
        stateManager.addLog({
          type: 'ORDER',
          line: targetLine,
          orderId: orderId,
          success: true,
          message: `[WEBHOOK] RCS báo hoàn thành lệnh ${orderId}. Đã tự động mở khóa Line ${targetLine.toUpperCase()}`
        });
      } else if (status == 3) {
        stateManager.resetLine(targetLine);
        stateManager.addLog({
          type: 'ORDER',
          line: targetLine,
          orderId: orderId,
          success: true,
          message: `[WEBHOOK] RCS báo lệnh ${orderId} đã huỷ. Đã tự động mở khóa Line ${targetLine.toUpperCase()}`
        });
      } else if (status == 5) {
        stateManager.resetLine(targetLine);
        stateManager.addLog({
          type: 'ORDER',
          line: targetLine,
          orderId: orderId,
          success: true,
          message: `[WEBHOOK] RCS báo lệnh ${orderId} failed do ${errorDesc}. Đã tự động mở khóa Line ${targetLine.toUpperCase()}`
        });
      } else {
        // Ghi log cho tất cả các tín hiệu khác mà không mở khóa Line
        stateManager.addLog({
          type: 'ORDER',
          line: targetLine,
          orderId: orderId,
          success: true,
          message: `[WEBHOOK] RCS cập nhật lệnh ${orderId} với trạng thái: ${status}`
        });
      }

      // Luôn trả về 1000 cho RCS
      return sendSuccess();

    } catch (err: any) {
      return res.status(500).json({ success: false, message: err.message });
    }
  });

  /**
   * GET /api/logs
   * Returns recent events/communication logs
   */
  app.get('/api/logs', (req, res) => {
    res.json({
      success: true,
      data: stateManager.getLogs(),
    });
  });

  // --- VITE MIDDLEWARE SETUP ---
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`AMR Control Panel server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
});
