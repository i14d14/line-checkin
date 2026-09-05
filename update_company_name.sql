UPDATE locations
SET name = '豬毛有限公司 - 台中美德總部', address = '台中市北區美德街56-11號'
WHERE id = '24549210-01';

UPDATE locations
SET name = '豬毛有限公司 - 台北101門市'
WHERE id = '24549210-02';

UPDATE company_employees
SET company_id = '24549210-01'
WHERE company_id LIKE '24549210%';
