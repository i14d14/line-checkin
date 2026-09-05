INSERT INTO company_employees (company_id, line_user_id, employee_name)
VALUES ('24549210-01', 'Ubd107bb3ba1b85a8086fc3b2250458e8', '🐖毛')
ON CONFLICT(line_user_id) DO UPDATE SET
  company_id = '24549210-01',
  employee_name = '🐖毛';
