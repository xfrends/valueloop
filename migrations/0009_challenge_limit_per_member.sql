-- Kuota challenge bulanan mengikuti kapasitas member plan: maxMembers × 30 hari,
-- sehingga setiap member bisa mendapat satu challenge per hari dalam sebulan.
-- Free: 25 × 30 = 750, Pro: 500 × 30 = 15000.
update plans
set limits = json_set(limits, '$.maxChallengesPerMonth', cast(json_extract(limits, '$.maxMembers') as integer) * 30)
where json_valid(limits)
  and json_extract(limits, '$.maxMembers') is not null;
