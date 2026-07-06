import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 3, // Safe low-load VUs
  duration: '10s',
  thresholds: {
    http_req_failed: ['rate<0.01'], // less than 1% errors
    http_req_duration: ['p(95)<500'], // 95% of requests under 500ms
  },
};

export default function () {
  const url = __ENV.VITE_TEST_BASE_URL || 'http://localhost:5173';
  
  // Test lookup endpoint or landing page
  const res = http.post(`${url}/api/auth/lookup`, JSON.stringify({ email: 'admin@tenant-a.com' }), {
    headers: { 'Content-Type': 'application/json' },
  });
  
  check(res, {
    'status is 200 or 404': (r) => r.status === 200 || r.status === 404,
  });
  
  sleep(1);
}
