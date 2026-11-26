-- Optional demo data. Coordinates are APPROXIMATE points on/near the IIT Patna
-- Bihta campus — walk the campus and replace them with surveyed coordinates
-- (Admin → Clues → "Use my location") before the real event.

with ev as (
  insert into public.events (name, description, start_at, end_at, status, is_current, rules)
  values (
    'HuntX 2026 – Shutter Quest',
    'A photography treasure hunt across the IIT Patna campus. Decode, locate, verify, capture.',
    now() + interval '1 day',
    now() + interval '1 day 3 hours',
    'scheduled',
    true,
    array[
      'One account per team. Share the login only within your team.',
      'Photos must be captured live through the HuntX camera.',
      'Verify your GPS location at each spot before capturing (if required).',
      'Leaving the hunt screen is recorded and may cost points.',
      'Stay on campus roads and paths. Do not enter restricted buildings or labs.',
      'Organisers have the final say on all photo approvals.'
    ]
  ) returning id
)
insert into public.event_settings (event_id, settings) select id, '{}'::jsonb from ev;

insert into public.clues (event_id, order_index, title, body, body_alt, language, difficulty,
                          target_lat, target_lng, radius_m, time_limit_minutes, points, hint, hint_penalty, unlock_rule)
select e.id, c.*
from public.events e,
(values
  (1, 'The Gate of Beginnings', 'Every journey here starts where the name is written large and the guards keep watch.', 'जहाँ नाम बड़े अक्षरों में लिखा है और पहरेदार पहरा देते हैं, वहीं से हर सफ़र शुरू होता है।', 'bilingual', 'easy', 25.5304, 84.8497, 40, 25, 100, 'Think of the first thing you see when you arrive.', 20, 'on_submission'),
  (2, 'Silent Shelves', 'A thousand voices sleep here, yet none of them may speak above a whisper.', null, 'en', 'medium', 25.5357, 84.8512, 35, 25, 120, 'Books, not people.', 25, 'on_submission'),
  (3, 'Fuel for Thought', 'Where minds refuel between lectures and chai is the real currency.', null, 'en', 'medium', 25.5371, 84.8530, 35, 25, 120, 'Follow the smell of samosas.', 25, 'on_submission'),
  (4, 'Arena of Echoes', 'Cheers rise where sweat falls; find the ground that keeps the score.', null, 'en', 'hard', 25.5389, 84.8478, 50, 30, 150, 'Shoes, whistles and floodlights.', 30, 'on_approval')
) as c(order_index, title, body, body_alt, language, difficulty, target_lat, target_lng, radius_m, time_limit_minutes, points, hint, hint_penalty, unlock_rule)
where e.is_current;
