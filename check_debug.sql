SELECT id, name, address, target_lat, target_lon, allowed_radius FROM locations;
SELECT id, company_id, line_user_id, display_name, latitude, longitude, distance_meters, status, punch_type, created_at FROM checkin_records ORDER BY id DESC LIMIT 5;
