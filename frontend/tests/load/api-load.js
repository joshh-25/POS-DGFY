import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '5s', target: 5 },  // Ramp up to 5 users
    { duration: '10s', target: 5 }, // Stay at 5 users
    { duration: '5s', target: 0 },  // Ramp down
  ],
  thresholds: {
    http_req_failed: ['rate<0.05'], // less than 5% errors
    http_req_duration: ['p(95)<1000'], // 95% of requests under 1s
  },
};

export default function () {
  const url = __ENV.VITE_TEST_BASE_URL || 'http://localhost:5173';
  
  // Attempt to fetch items list
  const res = http.get(`${url}/api/items`, {
    headers: { 'Content-Type': 'application/json' },
  });
  
  check(res, {
    'status is 200 or 401': (r) => r.status === 200 || r.status === 401,
  });
  
  sleep(1);
}
