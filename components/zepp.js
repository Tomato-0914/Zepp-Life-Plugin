import axios from 'axios';
import qs from 'qs';
import crypto from 'crypto';
import ZeppConfig from './config.js';

const HM_AES_KEY = 'xeNtBVqzDc6tuNTh';
const HM_AES_IV = 'MAAAYAAAAAAAAABg';

class ZeppAPI {
  static encryptData(plaintext) {
    const cipher = crypto.createCipheriv('aes-128-cbc', Buffer.from(HM_AES_KEY), Buffer.from(HM_AES_IV));
    let encrypted = cipher.update(plaintext, 'utf8');
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return encrypted;
  }

  static getRandomIP() {
    const getByte = () => Math.floor(Math.random() * 255) + 1;
    let first = getByte();
    while ([0, 10, 127].includes(first) || (first >= 224 && first <= 255)) {
      first = getByte();
    }
    return `${first}.${getByte()}.${getByte()}.${getByte()}`;
  }

  static async requests(url, data = '', apptoken = '') {
    const fakeIp = this.getRandomIP();
    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'User-Agent': 'MiFit6.14.0 (M2007J1SC; Android 12; Density/2.75)',
      'X-Forwarded-For': fakeIp,
      'Client-IP': fakeIp
    };
    if (apptoken) {
      headers['apptoken'] = apptoken;
    }
    let bodyData = data;
    if (data && typeof data === 'object') {
      bodyData = qs.stringify(data);
    }
    return axios({
      url,
      method: 'POST',
      headers,
      data: bodyData,
      timeout: 15000,
      validateStatus: () => true
    });
  }

  static async getAccessCode(username, password) {
    let url = 'https://api-user.zepp.com/v2/registrations/tokens';
    const useProxy = ZeppConfig.get('useProxy');
    const apiProxy = ZeppConfig.get('apiProxy');
    if (useProxy && apiProxy) {
      url = `${apiProxy.replace(/\/$/, '')}/?target=${encodeURIComponent(url)}`;
    }
    const loginData = {
      'emailOrPhone': username,
      'password': password,
      'state': 'REDIRECTION',
      'client_id': 'HuaMi',
      'country_code': 'CN',
      'token': 'access',
      'redirect_uri': 'https://s3-us-west-2.amazonaws.com/hm-registration/successsignin.html',
    };

    const query = qs.stringify(loginData);
    const cipherData = this.encryptData(query);

    // 最多重试 3 次，指数退避应对 429 限流
    const MAX_RETRY = 3;
    for (let attempt = 1; attempt <= MAX_RETRY; attempt++) {
      const fakeIp = this.getRandomIP();
      const res = await axios({
        url,
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'User-Agent': 'MiFit6.14.0 (M2007J1SC; Android 12; Density/2.75)',
          'app_name': 'com.xiaomi.hm.health',
          'appname': 'com.xiaomi.hm.health',
          'appplatform': 'android_phone',
          'x-hm-ekv': '1',
          'hm-privacy-ceip': 'false',
          'X-Forwarded-For': fakeIp,
          'Client-IP': fakeIp
        },
        data: cipherData,
        maxRedirects: 0,
        validateStatus: () => true
      });

      // 429：服务器频率限制，等待后重试
      if (res.status === 429) {
        const retryAfter = parseInt(res.headers['retry-after'] || '0', 10);
        // 优先使用 Retry-After 头，否则指数退避（5s, 10s, 20s）
        const waitMs = retryAfter > 0 ? retryAfter * 1000 : (5000 * Math.pow(2, attempt - 1));
        logger.warn(`[Zepp-Life-Plugin] 登录接口被限流(429)，${waitMs / 1000}s 后重试(${attempt}/${MAX_RETRY})...`);
        if (attempt < MAX_RETRY) {
          await new Promise(r => setTimeout(r, waitMs));
          continue;
        }
        throw new Error(`登录请求被华米服务器限流（429 Too Many Requests）。\n可能是短时间内尝试登录次数过多，请等待 5～10 分钟后再试。`);
      }

      const redirectUrl = res.headers.location || '';
      if (!redirectUrl) {
        const errCode = res.data?.code || res.status;
        const errMsg = res.data?.message || '未知错误';
        // 密码错误等情况直接抛出，不重试
        throw new Error(`华米登录验证不通过，状态: ${errCode}，原因: ${errMsg}`);
      }

      const match = redirectUrl.match(/access=(.*?)&/);
      if (!match) {
        throw new Error('无法从登录响应中解析出 access code，请重试');
      }
      return match[1];
    }
  }

  static async getToken(username, accessCode) {
    let url = 'https://account.huami.com/v2/client/login';
    const useProxy = ZeppConfig.get('useProxy');
    const apiProxy = ZeppConfig.get('apiProxy');
    if (useProxy && apiProxy) {
      url = `${apiProxy.replace(/\/$/, '')}/?target=${encodeURIComponent(url)}`;
    }
    const deviceId = crypto.randomUUID();
    const data = {
      'allow_registration': 'false',
      'app_name': 'com.xiaomi.hm.health',
      'app_version': '6.14.0',
      'code': accessCode,
      'country_code': 'CN',
      'device_id': deviceId,
      'device_model': 'android_phone',
      'dn': 'account.zepp.com,api-user.zepp.com,api-mifit.zepp.com,api-watch.zepp.com,app-analytics.zepp.com,api-analytics.huami.com,auth.zepp.com',
      'grant_type': 'access_token',
      'lang': 'zh_CN',
      'os_version': '1.5.0',
      'source': 'com.xiaomi.hm.health:6.14.0:50818',
      'third_name': username.includes('@') ? 'email' : 'huami_phone',
    };

    const MAX_RETRY = 3;
    for (let attempt = 1; attempt <= MAX_RETRY; attempt++) {
      const fakeIp = this.getRandomIP();
      const headers = {
        'app_name': 'com.xiaomi.hm.health',
        'x-request-id': crypto.randomUUID(),
        'accept-language': 'zh-CN',
        'appname': 'com.xiaomi.hm.health',
        'cv': '50818_6.14.0',
        'v': '2.0',
        'appplatform': 'android_phone',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Forwarded-For': fakeIp,
        'Client-IP': fakeIp
      };

      const res = await axios({
        url,
        method: 'POST',
        headers,
        data: qs.stringify(data),
        timeout: 15000,
        validateStatus: () => true
      });

      if (res.status === 429) {
        const retryAfter = parseInt(res.headers['retry-after'] || '0', 10);
        const waitMs = retryAfter > 0 ? retryAfter * 1000 : (5000 * Math.pow(2, attempt - 1));
        logger.warn(`[Zepp-Life-Plugin] getToken 被限流(429)，${waitMs / 1000}s 后重试(${attempt}/${MAX_RETRY})...`);
        if (attempt < MAX_RETRY) {
          await new Promise(r => setTimeout(r, waitMs));
          continue;
        }
        throw new Error(`获取 Token 时被服务器限流（429），请等待 5～10 分钟后再试。`);
      }

      const tokenInfo = res.data?.token_info;
      if (!tokenInfo || !tokenInfo.user_id || !tokenInfo.app_token) {
        const errMsg = res.data?.message || JSON.stringify(res.data);
        throw new Error(`获取 App Token 失败: ${errMsg}`);
      }

      return {
        userId: tokenInfo.user_id,
        appToken: tokenInfo.app_token
      };
    }
  }


  static async changeStep(userId, appToken, step) {
    const date = new Date();
    const year = date.getFullYear();
    let month = date.getMonth() + 1;
    let strDate = date.getDate();
    if (month < 10) month = `0${month}`;
    if (strDate < 10) strDate = `0${strDate}`;
    const dateStr = `${year}-${month}-${strDate}`;

    const t = String(Math.floor(Date.now() / 1000));
    const timestamp = Date.now();
    
    // 华米手环运动数据上传接口
    let url = `https://api-mifit-cn2.huami.com/v1/data/band_data.json?t=${timestamp}`;
    const useProxy = ZeppConfig.get('useProxy');
    const apiProxy = ZeppConfig.get('apiProxy');
    if (useProxy && apiProxy) {
      url = `${apiProxy.replace(/\/$/, '')}/?target=${encodeURIComponent(url)}`;
    }

    // 根据步数估算距离和卡路里
    const dis = Math.round(step * 0.6); // 约 0.6 米/步
    const cal = Math.round(step * 0.04); // 约 0.04 千卡/步

    const summaryObj = {
      v: 6,
      slp: {
        st: 1628296479,
        ed: 1628296479,
        dp: 0,
        lt: 0,
        wk: 0,
        usrSt: -1440,
        usrEd: -1440,
        wc: 0,
        is: 0,
        lb: 0,
        to: 0,
        dt: 0,
        rhr: 0,
        ss: 0
      },
      stp: {
        ttl: Number(step),
        dis: dis,
        cal: cal,
        wk: 41,
        rn: 50,
        runDist: Math.round(dis * 0.7),
        runCal: Math.round(cal * 0.7),
        stage: [
          { start: 327, stop: 341, mode: 1, dis: Math.round(dis * 0.05), cal: Math.round(cal * 0.05), step: Math.round(step * 0.05) },
          { start: 342, stop: 367, mode: 3, dis: Math.round(dis * 0.25), cal: Math.round(cal * 0.25), step: Math.round(step * 0.25) },
          { start: 368, stop: 377, mode: 4, dis: Math.round(dis * 0.15), cal: Math.round(cal * 0.15), step: Math.round(step * 0.15) },
          { start: 378, stop: 386, mode: 3, dis: Math.round(dis * 0.10), cal: Math.round(cal * 0.10), step: Math.round(step * 0.10) },
          { start: 387, stop: 393, mode: 4, dis: Math.round(dis * 0.10), cal: Math.round(cal * 0.10), step: Math.round(step * 0.10) },
          { start: 394, stop: 398, mode: 3, dis: Math.round(dis * 0.05), cal: Math.round(cal * 0.05), step: Math.round(step * 0.05) },
          { start: 399, stop: 414, mode: 4, dis: Math.round(dis * 0.20), cal: Math.round(cal * 0.20), step: Math.round(step * 0.20) },
          { start: 415, stop: 427, mode: 3, dis: Math.round(dis * 0.10), cal: Math.round(cal * 0.10), step: Math.round(step * 0.10) }
        ]
      },
      goal: 8000,
      tz: "28800"
    };

    const dataJsonObj = [
      {
        data_hr: "//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////8=",
        date: dateStr,
        data: [
          {
            start: 0,
            stop: 1439,
            value: Number(step),
            tz: 32,
            did: "DA932FFFFE8816E7",
            src: 24
          }
        ],
        summary: JSON.stringify(summaryObj),
        goal: 8000,
        tz: "28800"
      }
    ];

    const postData = {
      userid: userId,
      last_sync_data_time: t,
      device_type: 0,
      last_deviceid: 'DA932FFFFE8816E7',
      data_json: JSON.stringify(dataJsonObj)
    };

    const res = await this.requests(url, postData, appToken);
    if (res.data?.code == '1' || res.data?.message === 'success' || res.data?.code === 1) {
      return true;
    } else {
      throw new Error(res.data?.message || `修改接口返回失败, code: ${res.data?.code}`);
    }
  }

  /**
   * Token 有效期：23 小时（华米 Token 通常 30 天有效，保守设为 23h 避免长期不刷步时的过期）
   * 每次刷步优先复用缓存 Token，失败(401/403)后自动重新登录
   * @param {string} username
   * @param {string} password
   * @param {number} step
   * @param {object|null} cachedToken - { appToken, userId, tokenTime } from UserStore
   * @returns {{ success, steps, newToken }}
   */
  static async run(username, password, step, cachedToken = null) {
    // Token 缓存有效期 23 小时（毫秒）
    const TOKEN_TTL_MS = 23 * 60 * 60 * 1000;

    let appToken = cachedToken?.appToken;
    let userId = cachedToken?.userId;
    const tokenTime = cachedToken?.tokenTime || 0;
    const tokenExpired = !appToken || !userId || (Date.now() - tokenTime > TOKEN_TTL_MS);

    // 需要重新登录的情况：Token 不存在或已过期
    if (tokenExpired) {
      try {
        logger.info(`[Zepp-Life-Plugin] Token 不存在或已过期，重新登录: ${username}`);
        const accessCode = await this.getAccessCode(username, password);
        const tokenInfo = await this.getToken(username, accessCode);
        appToken = tokenInfo.appToken;
        userId = tokenInfo.userId;
      } catch (err) {
        return { success: false, error: `登录失败: ${err.message}`, newToken: null };
      }
    }

    try {
      await this.changeStep(userId, appToken, step);
      // 返回新 Token 供调用方缓存
      return {
        success: true,
        steps: step,
        newToken: { appToken, userId, tokenTime: tokenExpired ? Date.now() : tokenTime }
      };
    } catch (err) {
      // Token 可能失效，尝试强制重新登录一次
      if (!tokenExpired) {
        logger.warn(`[Zepp-Life-Plugin] 使用缓存 Token 失败，尝试重新登录: ${err.message}`);
        try {
          const accessCode = await this.getAccessCode(username, password);
          const tokenInfo = await this.getToken(username, accessCode);
          appToken = tokenInfo.appToken;
          userId = tokenInfo.userId;
          await this.changeStep(userId, appToken, step);
          return {
            success: true,
            steps: step,
            newToken: { appToken, userId, tokenTime: Date.now() }
          };
        } catch (retryErr) {
          return { success: false, error: retryErr.message, newToken: null };
        }
      }
      return { success: false, error: err.message, newToken: null };
    }
  }
}

export default ZeppAPI;
