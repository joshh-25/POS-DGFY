import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 2,
  duration: '10s',
  thresholds: {
    http_req_failed: ['rate<0.05'],
  },
};

export default function () {
  const url = __ENV.API_BASE_URL || 'http://localhost:5000/api/v1';
  
  // Safe lookup checking
  const payload = JSON.stringify({ email: 'admin@tenant-a.com' });
  const res = http.post(`${url}/auth/lookup`, payload, {
    headers: { 'Content-Type': 'application/json' },
  });
  
  check(res, {
    'status is 200 or 404': (r) => r.status === 200 || r.status === 404,
  });
  
  sleep(1);
}
