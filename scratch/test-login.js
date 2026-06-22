import axios from 'axios';
import qs from 'qs';
import crypto from 'crypto';

const username = 'tb_siran@163.com';
const password = 'Anima970914.';

const HM_AES_KEY = 'xeNtBVqzDc6tuNTh';
const HM_AES_IV = 'MAAAYAAAAAAAAABg';

function encryptData(plaintext) {
  const cipher = crypto.createCipheriv('aes-128-cbc', Buffer.from(HM_AES_KEY), Buffer.from(HM_AES_IV));
  let encrypted = cipher.update(plaintext, 'utf8');
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return encrypted;
}

function getRandomIP() {
  const getByte = () => Math.floor(Math.random() * 255) + 1;
  let first = getByte();
  while ([0, 10, 127].includes(first) || (first >= 224 && first <= 255)) {
    first = getByte();
  }
  return `${first}.${getByte()}.${getByte()}.${getByte()}`;
}

async function test() {
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
  const cipherData = encryptData(query);
  const fakeIp = getRandomIP();

  const url = 'https://api-user.zepp.com/v2/registrations/tokens';
  console.log('Sending encrypted request to:', url);

  try {
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

    console.log('Status Code:', res.status);
    console.log('Headers:', res.headers);
    console.log('Data:', res.data);
  } catch (err) {
    console.error('Error during request:', err);
  }
}

test();

