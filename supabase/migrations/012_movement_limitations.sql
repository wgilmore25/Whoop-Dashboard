alter table public.morning_checkins
  add column if not exists planned_movement text
    check (planned_movement in ('cycling', 'running', 'walking', 'rowing', 'swimming',
      'upper_body_strength', 'lower_body_strength', 'full_body_strength', 'other')),
  add column if not exists pain_region text
    check (pain_region in ('foot_or_ankle', 'knee', 'hip', 'back', 'neck',
      'shoulder', 'elbow', 'hand_or_wrist', 'other')),
  add column if not exists limited_movements text[] not null default '{}'
    check (limited_movements <@ array['cycling', 'running', 'walking', 'rowing', 'swimming',
      'upper_body_strength', 'lower_body_strength', 'full_body_strength', 'other']::text[]);
