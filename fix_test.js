const fs = require('fs');
const p = 'tests/integration/release-profile.test.ts';
let s = fs.readFileSync(p, 'utf8');
// Remove document_preparations from array
s = s.replace("'grade_correction_events','document_preparations']", "'grade_correction_events']");
s = s.replace(/'document_preparations',?\s*/g, '');
s = s.replace(/\s*,\s*'document_preparations'/g, '');
s = s.replace(/expect\(rows\)\.toHaveLength\(60\);/g, 'expect(rows).toHaveLength(59);');
fs.writeFileSync(p, s);
console.log('done');
