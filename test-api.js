// test-api.js
async function testAPI() {
  try {
    console.log('Testing API endpoint...');
    
    const response = await fetch('http://localhost:3000/api/prices', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        stocks: ['BBCA.JK'],
        crypto: [],
        exchangeRate: null
      }),
    });
    
    console.log('Response status:', response.status);
    console.log('Response headers:', response.headers);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Error response:', errorText);
      return;
    }
    
    const data = await response.json();
    console.log('Success response:', data);
  } catch (error) {
    console.error('Test failed:', error);
  }
}

testAPI();