-- Batch clean up test locations and associated orphaned test records
DELETE FROM approvals WHERE company_id LIKE '%-BPM-%' OR company_id LIKE '%-PBAC-%' OR company_id LIKE '%-TEST-%';
DELETE FROM employee_schedules WHERE company_id LIKE '%-BPM-%' OR company_id LIKE '%-PBAC-%' OR company_id LIKE '%-TEST-%';
DELETE FROM company_employees WHERE company_id LIKE '%-BPM-%' OR company_id LIKE '%-PBAC-%' OR company_id LIKE '%-TEST-%';
DELETE FROM checkin_records WHERE company_id LIKE '%-BPM-%' OR company_id LIKE '%-PBAC-%' OR company_id LIKE '%-TEST-%';
DELETE FROM locations WHERE id LIKE '%-BPM-%' OR id LIKE '%-PBAC-%' OR id LIKE '%-TEST-%';
