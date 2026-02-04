
async function test() {
    try {
        console.log('Sending feedback without company token...');
        const response = await fetch('http://localhost:5000/api/v1/feedback', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                type: 'idea',
                description: 'Testing fallback name #2',
                url: 'http://localhost:5173/',
                context: { test: true }
            })
        });
        const data = await response.json();
        console.log('Response:', data);
    } catch (err) {
        console.error('Error:', err.message);
    }
}

test();
