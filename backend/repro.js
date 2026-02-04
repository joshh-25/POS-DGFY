
const postData = JSON.stringify({
    username: 'testrepro',
    email: 'testrepro@bblabs.it',
    password: 'Password123!'
});

console.log('Sending request to localhost:5000...');

fetch('http://localhost:5000/api/v1/auth/register', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Origin': 'http://localhost:5173' // Mimic frontend
    },
    body: postData
})
    .then(async res => {
        console.log('Status:', res.status);
        const text = await res.text();
        console.log('Body:', text);
    })
    .catch(err => {
        console.error('Fetch error:', err);
    });
