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
  const PORT = 3001; // Đổi sang 3001 để tránh đụng Express port

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

        let currentSubTaskSeq = state.currentSubTaskSeq;
        let currentSubTaskStatus = state.currentSubTaskStatus;

        // Fallback: nếu chưa có trên state, tìm từ activeDevice
        if (!currentSubTaskSeq && state.currentOrderId) {
          const activeDevice = stateManager.getAllDevices()
            .find(d => d.orderId === state.currentOrderId);
          if (activeDevice?.subTaskSeq !== undefined) {
            currentSubTaskSeq = activeDevice.subTaskSeq;
            currentSubTaskStatus = activeDevice.subTaskStatus;
          }
        }

        return res.json({
          success: true,
          data: {
            line: lineKey,
            ...state,
            currentSubTaskSeq,
            currentSubTaskStatus,
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

    const lineState = stateManager.getLineState(lineKey.toLowerCase());
    if (lineState.status !== 'running') {
      return res.status(409).json({
        success: false,
        errorCode: 'LINE_NOT_RUNNING',
        message: `Line '${lineKey.toUpperCase()}' chưa có lệnh hoạt động. Vui lòng bấm GỌI LỆNH trước khi kích hoạt trigger.`,
      });
    }

    const currentOrderId = lineState.currentOrderId || undefined;

    const triggerPayload = {
      orderId: currentOrderId,
      currentStation: triggerConfig.triggerStation,
    };

    const triggerResult = await amrClient.sendTrigger(triggerPayload);

    if (!triggerResult.success) {
      stateManager.addLog({
        type: 'ERROR',
        line: lineKey,
        station: stationKey,
        orderId: currentOrderId,
        payload: triggerPayload,
        response: triggerResult.error,
        success: false,
        message: `Trigger điểm ${triggerConfig.triggerStation} thất bại: ${triggerResult.error}`,
        durationMs: triggerResult.durationMs,
      });

      return res.status(502).json({
        success: false,
        errorCode: 'TRIGGER_FAILED',
        message: triggerResult.error || 'Gửi Trigger thất bại.',
        orderId: currentOrderId,
        currentStation: triggerConfig.triggerStation,
        durationMs: triggerResult.durationMs,
      });
    }

    // Sau khi trigger thành công, xe bắt đầu di chuyển tới điểm tiếp theo
    stateManager.setLineSubTask(lineKey.toLowerCase(), undefined, '2');
    const activeDev = stateManager.getAllDevices().find(d => d.orderId === currentOrderId);
    if (activeDev) {
      activeDev.subTaskStatus = '2';
    }

    stateManager.addLog({
      type: 'TRIGGER',
      line: lineKey,
      station: stationKey,
      orderId: currentOrderId,
      payload: triggerPayload,
      response: triggerResult.data,
      success: true,
      message: `Kích hoạt Trigger điểm ${triggerConfig.triggerStation} (${stationConfig.code}) thành công`,
      durationMs: triggerResult.durationMs,
    });

    return res.json({
      success: true,
      orderId: currentOrderId,
      currentStation: triggerConfig.triggerStation,
      stationCode: stationConfig.code,
      message: `Trigger điểm ${triggerConfig.triggerStation} thành công.`,
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
   */
  app.post('/api/deviceInfo', (req, res) => {
    console.log('\n[WEBHOOK] /api/deviceInfo RAW PAYLOAD:');
    console.log(JSON.stringify(req.body, null, 2));
    try {
      const data = req.body;
      if (data && Array.isArray(data)) {
        stateManager.updateDevicesInfo(data);
      }
    } catch (error) {
      console.error(error);
    }
    return res.json({ "code": 1000, "desc": "success" });
  });

  app.all('/api/rcs', (req, res) => {
    console.log('\n[WEBHOOK] /api/rcs RAW PAYLOAD:');
    console.log(JSON.stringify(req.body, null, 2));
    try {
      // API gửi dạng { at: '...', payload: { ... } } hoặc gửi trực tiếp { ... }
      let payload = req.body?.payload || req.body || {};
      if (typeof payload === 'string') {
        try {
          payload = JSON.parse(payload);
        } catch { }
      }

      const orderId = payload.orderId || req.body?.orderId;
      const rawStatus = payload.status ?? payload.orderStatus ?? payload.taskStatus ?? payload.state ?? req.body?.status;
      const status = rawStatus !== undefined ? Number(rawStatus) : undefined;
      const deviceCode = payload.deviceCode || payload.deviceName || payload.deviceNum || req.body?.deviceCode;
      const subTaskSeq = payload.subTaskSeq !== undefined ? payload.subTaskSeq : req.body?.subTaskSeq;
      const subTaskStatus = payload.subTaskStatus !== undefined ? payload.subTaskStatus : req.body?.subTaskStatus;

      const sendSuccess = () => res.json({ "code": 1000, "desc": "success" });

      if (!orderId && status === undefined) {
        return res.status(400).json({ success: false, message: "Thiếu orderId hoặc status" });
      }

      // 1. Tìm xem orderId này thuộc Line nào
      const allStates = stateManager.getAllStates();
      let targetLine: string | null = null;

      if (orderId) {
        for (const [lineKey, state] of Object.entries(allStates)) {
          if (state.currentOrderId === orderId) {
            targetLine = lineKey;
            break;
          }
        }

        // Fallback tìm line theo tiền tố orderLabel cấu hình trong config
        if (!targetLine) {
          const cfg = amrClient.getConfig();
          for (const [lineKey, lineConfig] of Object.entries(cfg.lines)) {
            if (lineConfig.orderLabel && orderId.startsWith(lineConfig.orderLabel)) {
              targetLine = lineKey;
              break;
            }
          }
        }
      }

      // 2. Cập nhật tiến độ subTask nếu có
      // Status 10 từ RCS: Xe đã đến điểm dừng và đang chờ kích hoạt (waiting for continue trigger) -> coi như subTaskStatus = 3
      // Status 6: Xe đang di chuyển -> subTaskStatus = 2
      let resolvedSubTaskStatus = subTaskStatus;
      if (status === 10 && resolvedSubTaskStatus === undefined) {
        resolvedSubTaskStatus = '3';
      } else if (status === 6 && resolvedSubTaskStatus === undefined) {
        resolvedSubTaskStatus = '2';
      }

      if (targetLine) {
        stateManager.setLineSubTask(
          targetLine,
          subTaskSeq !== undefined ? String(subTaskSeq) : undefined,
          resolvedSubTaskStatus
        );
      }

      if (deviceCode && subTaskSeq !== undefined) {
        let statusPrefix = "";
        if (String(resolvedSubTaskStatus) === "2") statusPrefix = "[Đang làm] ";
        if (String(resolvedSubTaskStatus) === "3") statusPrefix = "[Hoàn thành] ";

        const stepMapping: Record<string, string> = {
          "0": "Bắt đầu đi đến điểm lấy hàng",
          "1": "Đang quay xe để móc hàng",
          "2": "Đang đi đến chỗ cấp hàng",
          "3": "Đang quay xe để móc hàng",
          "4": "Xe đang đến điểm trả hàng",
          "5": "Hoàn tất tháo hàng"
        };

        let stepName = statusPrefix + (stepMapping[String(subTaskSeq)] || `Xử lý bước ${subTaskSeq}`);
        if (targetLine) {
          stepName += ` cho ${targetLine.replace('-', ' ').toUpperCase()}`;
        }

        stateManager.updateDeviceTaskStep(deviceCode, String(subTaskSeq), stepName, orderId || '', resolvedSubTaskStatus);
      }

      // 3. Logic xử lý trạng thái tổng thể của order (Mở khoá line & Xóa subtask trên xe)
      // Status: 8 = hoàn thành, 3 = huỷ lệnh, 5 = thất bại
      if (status == 8 || status == 3 || status == 5) {
        // Mở khóa Line
        if (targetLine) {
          stateManager.resetLine(targetLine);
        } else if (orderId) {
          for (const [lineKey, state] of Object.entries(allStates)) {
            if (state.currentOrderId === orderId) {
              stateManager.resetLine(lineKey);
            }
          }
        }

        // LUÔN LUÔN xóa trạng thái subtask trên xe (kể cả khi không tìm thấy targetLine)
        stateManager.clearDeviceTask(deviceCode, orderId);

        const statusText = status == 8 ? 'hoàn thành' : status == 3 ? 'đã huỷ' : 'thất bại';
        stateManager.addLog({
          type: 'ORDER',
          line: targetLine || 'ALL',
          orderId: orderId,
          success: true,
          message: `[WEBHOOK] RCS báo lệnh ${orderId || 'không rõ'} ${statusText} (status: ${status}). Đã tự động mở khóa Line và xóa trạng thái Subtask.`
        });
      } else {
        // Ghi log cho tất cả các tín hiệu khác mà không mở khóa Line
        stateManager.addLog({
          type: 'ORDER',
          line: targetLine || 'UNKNOWN',
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
   * POST /api/alarm
   * Webhook to receive alarm updates (e.g. obstacle alert)
   */
  app.post('/api/alarm', (req, res) => {
    console.log('\n[WEBHOOK] /api/alarm RAW PAYLOAD:');
    console.log(JSON.stringify(req.body, null, 2));
    try {
      const payload = req.body || {};
      const { deviceName, deviceNum, channelDeviceId, alarmType, alarmDesc } = payload;

      const alarmMapping: Record<number, string> = {
        1: "Mất kết nối thiết bị",
        2: "Lỗi thiết bị",
        3: "Cảnh báo pin yếu",
        4: "Lỗi hệ thống AMR",
        5: "Lỗi cập nhật phần mềm",
        6: "Lỗi trạm (Node)",
        8: "Lỗi điều hướng",
        11: "Lỗi cập nhật bản đồ",
        12: "Phát hiện vật cản",
        15: "Nhiệt độ quá cao",
        20: "Lỗi cột sạc",
        21: "Lỗi quá trình sạc",
        22: "Lỗi kệ hàng",
        23: "Đường đi bất thường",
        24: "Lỗi cấu hình",
        25: "Tải trọng bất thường",
        26: "Lỗi thùng hàng",
        28: "Va chạm AGV",
        29: "Lỗi cảm biến Laser",
        30: "Hàng hóa quá cao",
        31: "Lỗi thay thế thiết bị",
        40: "Lỗi đầu đọc RFID",
        41: "Lỗi hệ thống cửa kiểm soát",
        42: "Lỗi điều khiển thang máy",
        43: "Lỗi cảm biến thùng hàng",
        44: "Lỗi Camera thông minh",
        45: "Đang chờ xác nhận",
        46: "Lỗi dịch vụ (Service exception)",
        48: "Lỗi máy nhắn tin",
        49: "Lỗi đèn báo công nghiệp",
        50: "Lỗi nhận dạng"
      };

      const identifier = deviceNum;
      if (identifier && alarmType !== undefined) {
        const alarmText = alarmMapping[alarmType] || `Unknown Alarm (${alarmType})`;
        stateManager.updateDeviceAlarm(identifier, alarmType, alarmText, alarmDesc || "");
      }

      return res.json({ "code": 1000, "desc": "success" });
    } catch (err: any) {
      console.error(err);
      return res.json({ "code": 1000, "desc": "success" });
    }
  });

  /**
   * POST /api/alarm/clear
   * Clear an alarm manually from the UI
   */
  app.post('/api/alarm/clear', (req, res) => {
    try {
      const { deviceCode } = req.body;
      if (deviceCode) {
        stateManager.clearDeviceAlarm(deviceCode);
      }
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ success: false, message: err.message });
    }
  });

  /**
   * GET /api/devices
   * Returns current states of all AMRs
   */
  app.get('/api/devices', (req, res) => {
    res.json({
      success: true,
      data: stateManager.getAllDevices(),
    });
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
      server: { middlewareMode: true, hmr: { port: 24679 } }, // Đổi sang 24679 để tránh đụng HMR port
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
