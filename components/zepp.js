import axios from 'axios';
import qs from 'qs';

class ZeppAPI {
  static async requests(url, data = '', apptoken = '') {
    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'User-Agent': 'Dalvik/2.1.0 (Linux; U; Android 5.1.1; SM-G9750 Build/LMY48Z)'
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
      validateStatus: () => true // Allow redirects or non-200 responses to be handled manually
    });
  }

  static async getAccessCode(username, password) {
    // 华米登录接口
    const url = `https://api-user.huami.com/registrations/${encodeURIComponent(username)}/tokens`;
    const data = {
      'phone_number': username,
      'password': password,
      'client_id': 'HuaMi',
      'token': 'access',
      'redirect_uri': 'https://s3-us-west-2.amazonaws.com/hm-registration/successsignin.html'
    };

    const res = await this.requests(url, data);
    
    // 如果响应是 302，说明是直接跳转，可以通过 headers 获取
    let redirectUrl = res.headers.location || '';
    
    // 如果 Axios 自动处理了跳转，也可以从 request.res.responseUrl 中解析
    if (!redirectUrl && res.request) {
      const responseUrl = res.request.res?.responseUrl || res.request.responseURL || '';
      if (responseUrl) {
        redirectUrl = responseUrl;
      }
    }

    if (!redirectUrl) {
      throw new Error('未获取到华米登录重定向 URL，请检查账号密码是否正确');
    }

    const match = redirectUrl.match(/access=(.*?)&/);
    if (!match) {
      throw new Error('无法从登录响应中解析出 access code，请重试');
    }
    return match[1];
  }

  static async getToken(username, accessCode) {
    const url = 'https://account.huami.com/v2/client/login';
    const data = {
      'allow_registration': 'false',
      'app_name': 'com.xiaomi.hm.health',
      'app_version': '6.3.5',
      'code': accessCode,
      'country_code': 'CN',
      'device_id': '2C8B4939-0CCD-4E94-8CBA-CB8EA6E613A1',
      'device_model': 'phone',
      'dn': 'api-user.huami.com,api-mifit.huami.com,app-analytics.huami.com',
      'grant_type': 'access_token',
      'lang': 'zh_CN',
      'os_version': '1.5.0',
      'source': 'com.xiaomi.hm.health',
      'third_name': username.includes('@') ? 'email' : 'huami_phone',
    };

    const res = await this.requests(url, data);
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
    const url = `https://api-mifit-cn2.huami.com/v1/data/band_data.json?t=${timestamp}`;

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

  static async run(username, password, step) {
    try {
      const accessCode = await this.getAccessCode(username, password);
      const token = await this.getToken(username, accessCode);
      const result = await this.changeStep(token.userId, token.appToken, step);
      return { success: true, steps: step };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }
}

export default ZeppAPI;
