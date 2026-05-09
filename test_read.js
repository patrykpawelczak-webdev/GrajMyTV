const path = require('path');
const fs = require('fs');
const QUESTIONS_FILE = path.join(__dirname, 'gry', 'rodziniada', 'public', 'pytania.json');
console.log('Path:', QUESTIONS_FILE);
console.log('Exists:', fs.existsSync(QUESTIONS_FILE));
try {
  const data = fs.readFileSync(QUESTIONS_FILE, 'utf8');
  console.log('Length:', data.length);
  const json = JSON.parse(data);
  console.log('Categories:', json.categories ? json.categories.length : 'none');
} catch(e) {
  console.error('Error:', e);
}
