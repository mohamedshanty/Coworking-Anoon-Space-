const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function request(method, urlPath, headers = {}) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'localhost',
      port: 5000,
      path: urlPath,
      method,
      headers: { ...headers },
    };
    const req = http.request(opts, (res) => {
      let chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const body = Buffer.concat(chunks);
        resolve({ status: res.statusCode, headers: res.headers, body });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

(async () => {
  // Login
  const login = await request('POST', '/api/v1/auth/login', {
    'Content-Type': 'application/json',
  });
  // Need to write body manually for login
  const loginReq = http.request({
    hostname: 'localhost', port: 5000, path: '/api/v1/auth/login', method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  }, (res) => {
    let chunks = [];
    res.on('data', c => chunks.push(c));
    res.on('end', async () => {
      const loginBody = JSON.parse(Buffer.concat(chunks).toString());
      const token = loginBody.accessToken;
      const auth = { Authorization: `Bearer ${token}` };

      console.log('=== REPORTS EXPORT TEST ===');

      // Export 1: "month" range (last 30 days)
      const now = new Date();
      const monthAgo = new Date(now.getTime() - 30 * 86400000);
      const from1 = monthAgo.toISOString().slice(0, 10);
      const to1 = now.toISOString().slice(0, 10);

      console.log(`Range 1: ${from1} to ${to1}`);
      const resp1 = await request('GET',
        `/api/v1/reports/export?from=${from1}&to=${to1}&format=xlsx&_t=${Date.now()}`, auth);
      console.log(`Response 1: status=${resp1.status}, content-type=${resp1.headers['content-type']}, size=${resp1.body.length} bytes`);
      fs.writeFileSync(path.join(process.cwd(), 'export_range1.xlsx'), resp1.body);

      // Export 2: "lastMonth" range (30-60 days ago)
      const twoMonthsAgo = new Date(now.getTime() - 60 * 86400000);
      const monthAgo2 = new Date(now.getTime() - 30 * 86400000);
      const from2 = twoMonthsAgo.toISOString().slice(0, 10);
      const to2 = monthAgo2.toISOString().slice(0, 10);

      console.log(`Range 2: ${from2} to ${to2}`);
      const resp2 = await request('GET',
        `/api/v1/reports/export?from=${from2}&to=${to2}&format=xlsx&_t=${Date.now()}`, auth);
      console.log(`Response 2: status=${resp2.status}, content-type=${resp2.headers['content-type']}, size=${resp2.body.length} bytes`);
      fs.writeFileSync(path.join(process.cwd(), 'export_range2.xlsx'), resp2.body);

      // Export 3: "all" range
      const from3 = '2020-01-01';
      const to3 = now.toISOString().slice(0, 10);
      console.log(`Range 3: ${from3} to ${to3}`);
      const resp3 = await request('GET',
        `/api/v1/reports/export?from=${from3}&to=${to3}&format=xlsx&_t=${Date.now()}`, auth);
      console.log(`Response 3: status=${resp3.status}, size=${resp3.body.length} bytes`);
      fs.writeFileSync(path.join(process.cwd(), 'export_range3.xlsx'), resp3.body);

      // Compare
      const hash1 = crypto.createHash('md5').update(resp1.body).digest('hex');
      const hash2 = crypto.createHash('md5').update(resp2.body).digest('hex');
      const hash3 = crypto.createHash('md5').update(resp3.body).digest('hex');

      console.log('\n=== HASH COMPARISON ===');
      console.log(`Range 1 (month):     ${hash1} (${resp1.body.length} bytes)`);
      console.log(`Range 2 (lastMonth): ${hash2} (${resp2.body.length} bytes)`);
      console.log(`Range 3 (all):       ${hash3} (${resp3.body.length} bytes)`);
      console.log(`Range 1 == Range 2? ${hash1 === hash2 ? 'YES (BUG!)' : 'NO (different - correct)'}`);
      console.log(`Range 1 == Range 3? ${hash1 === hash3 ? 'YES (BUG!)' : 'NO (different - correct)'}`);
      console.log(`Range 2 == Range 3? ${hash2 === hash3 ? 'YES (BUG!)' : 'NO (different - correct)'}`);

      // Try to parse the XLSX to verify row content
      try {
        const ExcelJS = require('exceljs');

        for (const [label, file] of [['Range1-month', 'export_range1.xlsx'], ['Range2-lastMonth', 'export_range2.xlsx'], ['Range3-all', 'export_range3.xlsx']]) {
          const wb = new ExcelJS.Workbook();
          await wb.xlsx.readFile(file);
          const visitsSheet = wb.getWorksheet('الزيارات');
          const expenseSheet = wb.getWorksheet('المصروفات');
          console.log(`\n--- ${label} ---`);
          console.log(`  Visits sheet rows: ${visitsSheet ? visitsSheet.rowCount - 1 : 'N/A'} (excl header)`);
          if (visitsSheet && visitsSheet.rowCount > 1) {
            // Show first and last visit dates
            const firstRow = visitsSheet.getRow(2);
            const lastRow = visitsSheet.getRow(visitsSheet.rowCount);
            console.log(`  First visit checkIn: ${firstRow.getCell(3).value}`);
            console.log(`  Last visit checkIn: ${lastRow.getCell(3).value}`);
          }
          if (expenseSheet && expenseSheet.rowCount > 1) {
            console.log(`  Expense rows: ${expenseSheet.rowCount - 1}`);
            const firstExp = expenseSheet.getRow(2);
            console.log(`  First expense date: ${firstExp.getCell(1).value}`);
          }
        }
      } catch (e) {
        console.log('ExcelJS parse error:', e.message);
        console.log('Install exceljs: npm install exceljs');
      }

      // Cleanup
      fs.unlinkSync(path.join(process.cwd(), 'export_range1.xlsx'));
      fs.unlinkSync(path.join(process.cwd(), 'export_range2.xlsx'));
      fs.unlinkSync(path.join(process.cwd(), 'export_range3.xlsx'));

      console.log('\n=== DONE ===');
    });
  });
  loginReq.write(JSON.stringify({ username: 'admin', password: 'password123' }));
  loginReq.end();
})();
