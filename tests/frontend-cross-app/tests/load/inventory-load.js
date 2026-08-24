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
  
  const res = http.get(`${url}/items`, {
    headers: { 
      'x-company-token': 'token-tenant-a',
      'Accept': 'application/json'
    },
  });
  
  check(res, {
    'status is 200 or 401': (r) => r.status === 200 || r.status === 401,
  });
  
  sleep(1);
}
