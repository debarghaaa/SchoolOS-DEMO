-- SchoolOS presence feed: demo seed for the Northview tenant.
-- Idempotent (ON CONFLICT DO NOTHING); safe to re-run. Punch rows always
-- target CURRENT_DATE so the islands light up on any day. Demo-only:
-- production rows come from the sync worker with the service_role key.

insert into profiles (id, tenant_id, role, full_name, email) values
  ('6d85a525-1495-5ba0-ad64-35b8ab43d322', '7ba3571d-10be-5951-9227-8c84d8bfbb09', 'school-admin', 'Ananya Rao', 'admin@northview.edu'),
  ('c1c0cc39-7e4c-5603-b38f-aa43eac80c28', '7ba3571d-10be-5951-9227-8c84d8bfbb09', 'teacher', 'Rohan Sen', 'rohan@northview.edu'),
  ('449becb9-545c-5b7b-b4ce-4b7eb71f7155', '7ba3571d-10be-5951-9227-8c84d8bfbb09', 'student', 'Ishita Dutta', 'ishita@northview.edu'),
  ('54b7f515-a0b7-5dd7-8ca5-d2d09bacea51', '7ba3571d-10be-5951-9227-8c84d8bfbb09', 'parent', 'Guardian Dutta', 'parent@example.com')
on conflict (id) do nothing;

insert into faculty (id, tenant_id, profile_id, name, initials, subject, dept) values
  ('24ab6f02-4b22-5b2e-8dbd-ab406a8650e2', '7ba3571d-10be-5951-9227-8c84d8bfbb09', null, 'Amit Verma', 'AV', 'Physics', 'Sciences'),
  ('a6ab06ad-7b80-5ef9-a9c1-2454a0a4af11', '7ba3571d-10be-5951-9227-8c84d8bfbb09', null, 'Priya Nair', 'PN', 'Mathematics', 'Sciences'),
  ('46ead3fe-8dfb-5f12-b87f-e5f87354b623', '7ba3571d-10be-5951-9227-8c84d8bfbb09', null, 'Arjun Das', 'RD', 'English', 'Humanities'),
  ('35a71540-8fe8-5ab1-8b59-678b696537a9', '7ba3571d-10be-5951-9227-8c84d8bfbb09', null, 'Kavita Rao', 'KR', 'Chemistry', 'Sciences'),
  ('4ca26a53-2a83-5a1c-86b9-26c207b8ae9d', '7ba3571d-10be-5951-9227-8c84d8bfbb09', null, 'Vikram Iyer', 'SI', 'History', 'Humanities'),
  ('68a7adc4-08d8-5100-b684-73cd8062c15c', '7ba3571d-10be-5951-9227-8c84d8bfbb09', null, 'Sunita Joshi', 'LJ', 'Biology', 'Sciences'),
  ('aa11bb22-cc33-4d44-8e55-ff6677889900', '7ba3571d-10be-5951-9227-8c84d8bfbb09', 'c1c0cc39-7e4c-5603-b38f-aa43eac80c28', 'Rohan Sen', 'RS', 'Physics', 'Sciences')
on conflict (id) do nothing;

insert into staff_members (id, tenant_id, name, initials, role, dept, staff_type) values
  ('12c18b54-0c98-59f2-90e2-41ab62b278f6', '7ba3571d-10be-5951-9227-8c84d8bfbb09', 'Ritu Malhotra', 'RM', 'Registrar', 'Administration', 'Administrative Staff'),
  ('4f3e4463-cc66-5612-9217-96f696317daa', '7ba3571d-10be-5951-9227-8c84d8bfbb09', 'Suresh Yadav', 'SY', 'Transport Manager', 'Operations', 'Transport'),
  ('d81f6da6-3e56-5b94-9d5f-31ef677463a1', '7ba3571d-10be-5951-9227-8c84d8bfbb09', 'Fatima Sheikh', 'FS', 'Librarian', 'Library', 'Library Staff'),
  ('9e38497f-90bd-58b8-b5b5-054b62dd1853', '7ba3571d-10be-5951-9227-8c84d8bfbb09', 'Gopal Naskar', 'GN', 'Lab Technician', 'Sciences', 'Laboratory Staff'),
  ('825619d6-2818-5625-b73e-b830e4b14829', '7ba3571d-10be-5951-9227-8c84d8bfbb09', 'Dipak Mondal', 'DM', 'IT Administrator', 'Technology', 'IT Support'),
  ('245d4e3e-6b51-5af0-8907-43d5045c1b92', '7ba3571d-10be-5951-9227-8c84d8bfbb09', 'Karan Nair', 'KN', 'Security Officer', 'Campus Safety', 'Security'),
  ('0b00edba-69b7-5266-8721-6707df04e62d', '7ba3571d-10be-5951-9227-8c84d8bfbb09', 'Farhan Ali', 'FA', 'Maintenance Supervisor', 'Facilities', 'Maintenance'),
  ('604ef45e-e820-571c-9ef1-9691fedf6282', '7ba3571d-10be-5951-9227-8c84d8bfbb09', 'Anjali Rao', 'AR', 'Counsellor', 'Wellbeing', 'Support Staff')
on conflict (id) do nothing;

insert into students (id, tenant_id, profile_id, name, initials, grade, section, roll) values
  ('c5ab8a83-4dc1-585f-8ee8-8d6017b31d7f', '7ba3571d-10be-5951-9227-8c84d8bfbb09', null, 'Aarav Sharma', 'AS', 'Grade 10', 'A', '01'),
  ('d983dce8-05ac-54c6-a6f0-e1fa30058cdf', '7ba3571d-10be-5951-9227-8c84d8bfbb09', null, 'Rahul Verma', 'RV', 'Grade 10', 'A', '02'),
  ('dd740814-984e-574c-a070-382a071a9656', '7ba3571d-10be-5951-9227-8c84d8bfbb09', null, 'Priya Sharma', 'PS', 'Grade 10', 'A', '03'),
  ('6d575e1f-b38b-56e5-8259-676b7a985039', '7ba3571d-10be-5951-9227-8c84d8bfbb09', null, 'Arjun Chatterjee', 'AC', 'Grade 10', 'A', '04'),
  ('89877321-849b-5eba-bfef-1c627df76f9c', '7ba3571d-10be-5951-9227-8c84d8bfbb09', null, 'Neha Iyer', 'NI', 'Grade 10', 'A', '05'),
  ('cbec8eb6-5dbc-52ba-9e60-ccf5e8847d4c', '7ba3571d-10be-5951-9227-8c84d8bfbb09', null, 'Karan Joshi', 'KJ', 'Grade 10', 'A', '06'),
  ('9ae66cde-5469-5e57-8d8e-07a00d71399f', '7ba3571d-10be-5951-9227-8c84d8bfbb09', null, 'Divya Nair', 'DN', 'Grade 10', 'B', '01'),
  ('4112d678-9c17-5bbd-8d50-54c17851ef19', '7ba3571d-10be-5951-9227-8c84d8bfbb09', null, 'Aditya Rao', 'AR', 'Grade 10', 'B', '02'),
  ('bdb7a9d3-5fca-548b-960f-31e92a81c99b', '7ba3571d-10be-5951-9227-8c84d8bfbb09', null, 'Sneha Kulkarni', 'SK', 'Grade 10', 'B', '03'),
  ('8a1a93ef-5298-55ca-a20d-5bbfc874d579', '7ba3571d-10be-5951-9227-8c84d8bfbb09', null, 'Vikram Reddy', 'VR', 'Grade 10', 'B', '04'),
  ('31a1d4c6-63e9-5b68-8d0d-e14807883bc1', '7ba3571d-10be-5951-9227-8c84d8bfbb09', null, 'Pooja Menon', 'PM', 'Grade 10', 'B', '05'),
  ('6c29fe3f-5728-50b2-861d-e0f2062cd9e7', '7ba3571d-10be-5951-9227-8c84d8bfbb09', null, 'Rahul Patel', 'RP', 'Grade 10', 'B', '06'),
  ('bb22cc33-dd44-4e55-8f66-aa7788990011', '7ba3571d-10be-5951-9227-8c84d8bfbb09', '449becb9-545c-5b7b-b4ce-4b7eb71f7155', 'Ishita Dutta', 'ID', 'Grade 10', 'B', '14')
on conflict (id) do nothing;

insert into family_links (id, tenant_id, parent_profile_id, student_id) values
  ('12aba560-49f6-569f-8418-c546825f4583', '7ba3571d-10be-5951-9227-8c84d8bfbb09', '54b7f515-a0b7-5dd7-8ca5-d2d09bacea51', 'bb22cc33-dd44-4e55-8f66-aa7788990011')
on conflict (parent_profile_id, student_id) do nothing;

-- Today's feed. Absent rows carry no punch times; a null punch_out means on campus.
insert into presence_days (tenant_id, audience, person_id, day, status, punch_in, punch_out) values
  ('7ba3571d-10be-5951-9227-8c84d8bfbb09', 'faculty', '24ab6f02-4b22-5b2e-8dbd-ab406a8650e2', current_date, 'present', '07:48', null),
  ('7ba3571d-10be-5951-9227-8c84d8bfbb09', 'faculty', 'a6ab06ad-7b80-5ef9-a9c1-2454a0a4af11', current_date, 'present', '07:55', '15:47'),
  ('7ba3571d-10be-5951-9227-8c84d8bfbb09', 'faculty', '46ead3fe-8dfb-5f12-b87f-e5f87354b623', current_date, 'present', '07:40', '15:47'),
  ('7ba3571d-10be-5951-9227-8c84d8bfbb09', 'faculty', '35a71540-8fe8-5ab1-8b59-678b696537a9', current_date, 'present', '07:51', null),
  ('7ba3571d-10be-5951-9227-8c84d8bfbb09', 'faculty', '4ca26a53-2a83-5a1c-86b9-26c207b8ae9d', current_date, 'present', '07:47', '15:47'),
  ('7ba3571d-10be-5951-9227-8c84d8bfbb09', 'faculty', '68a7adc4-08d8-5100-b684-73cd8062c15c', current_date, 'absent', null, null),
  ('7ba3571d-10be-5951-9227-8c84d8bfbb09', 'faculty', 'aa11bb22-cc33-4d44-8e55-ff6677889900', current_date, 'present', '07:52', null),
  ('7ba3571d-10be-5951-9227-8c84d8bfbb09', 'staff', '12c18b54-0c98-59f2-90e2-41ab62b278f6', current_date, 'present', '07:58', null),
  ('7ba3571d-10be-5951-9227-8c84d8bfbb09', 'staff', '4f3e4463-cc66-5612-9217-96f696317daa', current_date, 'present', '07:54', '16:05'),
  ('7ba3571d-10be-5951-9227-8c84d8bfbb09', 'staff', 'd81f6da6-3e56-5b94-9d5f-31ef677463a1', current_date, 'present', '07:43', '16:05'),
  ('7ba3571d-10be-5951-9227-8c84d8bfbb09', 'staff', '9e38497f-90bd-58b8-b5b5-054b62dd1853', current_date, 'present', '07:54', '16:05'),
  ('7ba3571d-10be-5951-9227-8c84d8bfbb09', 'staff', '825619d6-2818-5625-b73e-b830e4b14829', current_date, 'present', '07:55', '16:05'),
  ('7ba3571d-10be-5951-9227-8c84d8bfbb09', 'staff', '245d4e3e-6b51-5af0-8907-43d5045c1b92', current_date, 'present', '07:46', null),
  ('7ba3571d-10be-5951-9227-8c84d8bfbb09', 'staff', '0b00edba-69b7-5266-8721-6707df04e62d', current_date, 'present', '07:42', '16:05'),
  ('7ba3571d-10be-5951-9227-8c84d8bfbb09', 'staff', '604ef45e-e820-571c-9ef1-9691fedf6282', current_date, 'absent', null, null),
  ('7ba3571d-10be-5951-9227-8c84d8bfbb09', 'student', 'c5ab8a83-4dc1-585f-8ee8-8d6017b31d7f', current_date, 'present', '07:49', null),
  ('7ba3571d-10be-5951-9227-8c84d8bfbb09', 'student', 'd983dce8-05ac-54c6-a6f0-e1fa30058cdf', current_date, 'present', '07:50', null),
  ('7ba3571d-10be-5951-9227-8c84d8bfbb09', 'student', 'dd740814-984e-574c-a070-382a071a9656', current_date, 'present', '07:58', null),
  ('7ba3571d-10be-5951-9227-8c84d8bfbb09', 'student', '6d575e1f-b38b-56e5-8259-676b7a985039', current_date, 'absent', null, null),
  ('7ba3571d-10be-5951-9227-8c84d8bfbb09', 'student', '89877321-849b-5eba-bfef-1c627df76f9c', current_date, 'present', '07:48', null),
  ('7ba3571d-10be-5951-9227-8c84d8bfbb09', 'student', 'cbec8eb6-5dbc-52ba-9e60-ccf5e8847d4c', current_date, 'present', '07:47', null),
  ('7ba3571d-10be-5951-9227-8c84d8bfbb09', 'student', '9ae66cde-5469-5e57-8d8e-07a00d71399f', current_date, 'present', '07:44', null),
  ('7ba3571d-10be-5951-9227-8c84d8bfbb09', 'student', '4112d678-9c17-5bbd-8d50-54c17851ef19', current_date, 'present', '07:57', null),
  ('7ba3571d-10be-5951-9227-8c84d8bfbb09', 'student', 'bdb7a9d3-5fca-548b-960f-31e92a81c99b', current_date, 'present', '07:49', null),
  ('7ba3571d-10be-5951-9227-8c84d8bfbb09', 'student', '8a1a93ef-5298-55ca-a20d-5bbfc874d579', current_date, 'present', '07:54', null),
  ('7ba3571d-10be-5951-9227-8c84d8bfbb09', 'student', '31a1d4c6-63e9-5b68-8d0d-e14807883bc1', current_date, 'present', '07:58', null),
  ('7ba3571d-10be-5951-9227-8c84d8bfbb09', 'student', '6c29fe3f-5728-50b2-861d-e0f2062cd9e7', current_date, 'absent', null, null),
  ('7ba3571d-10be-5951-9227-8c84d8bfbb09', 'student', 'bb22cc33-dd44-4e55-8f66-aa7788990011', current_date, 'present', '07:52', null)
on conflict (tenant_id, audience, person_id, day) do nothing;
