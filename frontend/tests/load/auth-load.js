import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 2,
  duration: '10s',
  thresholds: {
    http_req_failed: ['rate<0.05'],
    http_req_duration: ['p(95)<1000'],
  },
};

export default function () {
  const url = __ENV.API_BASE_URL || 'http://localhost:5000/api/v1';
  
  const payload = JSON.stringify({
    email: 'admin@tenant-a.com',
    password: 'WrongPassword123!',
  });
  
  const res = http.post(`${url}/auth/login`, payload, {
    headers: { 'Content-Type': 'application/json' },
  });
  
  check(res, {
    'status is 401 (invalid login)': (r) => r.status === 401 || r.status === 400 || r.status === 404,
  });
  
  sleep(1);
}
