SELECT ce.id, ce.line_user_id, ce.company_id, ce.employee_name, ce.created_at, l.name AS location_name, l.address AS location_address
FROM company_employees ce
LEFT JOIN locations l ON ce.company_id = l.id
ORDER BY ce.id DESC;
