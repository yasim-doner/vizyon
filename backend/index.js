import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import pool from './db.js';

dotenv.config();

let mockServerDate = null; // Global mock date in YYYY-MM-DD format

const getToday = () => {
  if (mockServerDate) {
    const parts = mockServerDate.split('-');
    return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]), 12, 0, 0);
  }
  return new Date();
};

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey_change_me';

app.use(cors());
app.use(express.json());

// Default 10 missions defined in the PDF
const defaultMissions = [
  { title: 'Bir Kitap Okumak', description: 'En az bir kitap okumak.', interval: 'monthly' },
  { title: 'Beş Vakit Namazı Eda veya Kaza Etmek', description: 'Günde beş vakit namazı eda veya kaza etmek.', interval: 'daily' },
  { title: 'İki Makale Anlayarak Okumak', description: 'Anlayarak (anlatabilecek düzeyde inceleyerek) iki makale okumak.', interval: 'monthly' },
  { title: 'İki Faydalı Video İzlemek', description: 'Kişisel gelişim odaklı en az iki faydalı video izlemek.', interval: 'monthly' },
  { title: 'Bir Şiir Ezberlemek', description: 'En az bir şiir ezberlemek.', interval: 'monthly' },
  { title: 'On Yabancı Kelime Öğrenmek', description: 'En az on yabancı kelime öğrenmek.', interval: 'monthly' },
  { title: 'Uyku Düzenini Korumak', description: 'Saat 1.00\'den önce uykuya geçilip 9 saatten az uyumak. (İkindi namazı vaktinde uyumamak gerekir.)', interval: 'daily' },
  { title: 'Bir Vizyon Üyesinin Halini Hatırını Sormak', description: 'Bir vizyon üyesini arayıp hal hatır sormak.', interval: 'monthly' },
  { title: 'Spor Yapmak', description: 'Haftada en az iki gün spor yapmak. (Hangi günler spor yapıldığını takvimde işaretleyin.)', interval: 'weekly' },
  { title: 'Bir Film İzlemek', description: 'En az bir film izlemek.', interval: 'monthly' }
];

// Helper to seed missions for a user
const seedUserMissions = async (client, userId) => {
  for (const m of defaultMissions) {
    const existCheck = await client.query(
      'SELECT * FROM missions WHERE assigned_to = $1 AND title = $2',
      [userId, m.title]
    );
    if (existCheck.rows.length === 0) {
      await client.query(
        'INSERT INTO missions (title, description, interval, assigned_to) VALUES ($1, $2, $3, $4)',
        [m.title, m.description, m.interval, userId]
      );
    }
  }
};

// Initialize Database Tables & Seed Admin
const initDB = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Create Users Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        is_admin BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create Missions Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS missions (
        id SERIAL PRIMARY KEY,
        title VARCHAR(150) NOT NULL,
        description TEXT,
        interval VARCHAR(20) DEFAULT 'monthly' CHECK (interval IN ('daily', 'weekly', 'monthly')),
        assigned_to INTEGER REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create Mission Logs Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS mission_logs (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        mission_id INTEGER REFERENCES missions(id) ON DELETE CASCADE,
        log_date DATE NOT NULL,
        notes TEXT,
        UNIQUE (user_id, mission_id, log_date)
      )
    `);

    // Ensure notes column exists
    await client.query(`
      ALTER TABLE mission_logs ADD COLUMN IF NOT EXISTS notes TEXT
    `);

    // Create Vizyon Account Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS vizyon_account (
        id SERIAL PRIMARY KEY,
        balance NUMERIC(10, 2) DEFAULT 0.00
      )
    `);

    // Create Penalty Payments Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS penalty_payments (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        amount NUMERIC(10, 2) NOT NULL,
        paid_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Seed Admin User (yasim)
    const adminCheck = await client.query('SELECT * FROM users WHERE username = $1', ['yasim']);
    let adminId;
    if (adminCheck.rows.length === 0) {
      const initialAdminPassword = process.env.INITIAL_ADMIN_PASSWORD || 'default_admin_password_123';
      const passwordHash = await bcrypt.hash(initialAdminPassword, 10);
      const adminRes = await client.query(
        'INSERT INTO users (username, password_hash, is_admin) VALUES ($1, $2, $3) RETURNING id',
        ['yasim', passwordHash, true]
      );
      adminId = adminRes.rows[0].id;
      console.log('Seeded default admin user "yasim" successfully.');
    } else {
      adminId = adminCheck.rows[0].id;
    }

    // Seed default missions for the admin
    await seedUserMissions(client, adminId);

    // Seed Vizyon Account Row
    const accountCheck = await client.query('SELECT * FROM vizyon_account WHERE id = 1');
    if (accountCheck.rows.length === 0) {
      await client.query('INSERT INTO vizyon_account (id, balance) VALUES (1, 0.00)');
      console.log('Seeded Vizyon Account with 0.00 TL.');
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error initializing database:', error);
  } finally {
    client.release();
  }
};

// Run DB Init
initDB();

// Authentication Middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'Access token required' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid or expired token' });
    req.user = user;
    next();
  });
};

// Admin Authorization Middleware
const requireAdmin = (req, res, next) => {
  if (!req.user || !req.user.isAdmin) {
    return res.status(403).json({ error: 'Administrator access required' });
  }
  next();
};

// Helper to calculate weeks in a month
const getWeeksInMonth = (year, month) => {
  const weeks = [];
  const firstDay = new Date(year, month - 1, 1, 12, 0, 0);
  const lastDay = new Date(year, month, 0, 12, 0, 0);

  let current = new Date(firstDay);
  const dayOfWeek = current.getDay();
  // Adjust to starting on Monday
  const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  current.setDate(current.getDate() + diff);

  const today = getToday();
  today.setHours(0, 0, 0, 0);

  while (current <= lastDay) {
    const start = new Date(current);
    start.setHours(0, 0, 0, 0);
    const end = new Date(current);
    end.setDate(end.getDate() + 6);
    end.setHours(23, 59, 59, 999);

    const isPassed = end < today;

    if (end >= firstDay && start <= lastDay) {
      weeks.push({ start, end, isPassed });
    }

    current.setDate(current.getDate() + 7);
  }
  return weeks;
};

// Helper: Calculate penalty of a single user for a given month/year
const calculateUserPenalty = async (userId, year, month, ignoreMonthEndCheck = false) => {
  // Fetch user's missions
  const missionsRes = await pool.query('SELECT * FROM missions WHERE assigned_to = $1', [userId]);
  const missions = missionsRes.rows;

  if (missions.length === 0) return 0;

  // Fetch all logs of this user for this month
  const logsRes = await pool.query(
    `SELECT mission_id, log_date 
     FROM mission_logs 
     WHERE user_id = $1 
       AND EXTRACT(YEAR FROM log_date) = $2 
       AND EXTRACT(MONTH FROM log_date) = $3`,
    [userId, year, month]
  );
  const logs = logsRes.rows;

  // Get days parameters
  const today = getToday();
  const isCurrentMonth = today.getFullYear() === year && (today.getMonth() + 1) === month;
  
  // Cezalar sadece ayın sonunda güncellenmeli.
  // Eğer cari (devam eden) ay içerisindeysek ve bugün ayın son günü değilse ceza 0 TL'dir.
  if (isCurrentMonth && !ignoreMonthEndCheck) {
    const lastDayOfMonth = new Date(year, month, 0).getDate();
    const isLastDay = today.getDate() === lastDayOfMonth;
    if (!isLastDay) {
      return 0; // Ay sonu gelene kadar ceza yansımaz (0 TL)
    }
  }

  const totalDaysInMonth = new Date(year, month, 0).getDate();
  // For forecast, we want to know what the penalty will be if they stop today.
  // So we check daily targets against the full month instead of just today.
  const targetDailyDaysCount = (!ignoreMonthEndCheck && isCurrentMonth) ? today.getDate() : totalDaysInMonth;

  const weeks = getWeeksInMonth(year, month);
  let failedMissionsCount = 0;

  for (const m of missions) {
    const missionLogs = logs.filter(l => l.mission_id === m.id).map(l => {
      // Normalize dates to local string YYYY-MM-DD
      const d = new Date(l.log_date);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    });

    const uniqueLoggedDays = [...new Set(missionLogs)].length;

    if (m.interval === 'daily') {
      if (m.title.includes('Namaz')) {
        // Namaz daily target
        if (uniqueLoggedDays < targetDailyDaysCount) {
          failedMissionsCount++;
        }
      } else if (m.title.includes('Uyku')) {
        // Sleep target: >= 15 days in the month
        if (uniqueLoggedDays < 15) {
          failedMissionsCount++;
        }
      }
    } else if (m.interval === 'weekly') {
      if (m.title.includes('Spor')) {
        // Sport target: >= 2 days in each passed calendar week (or current week too, in case of forecast)
        let hasFailedWeek = false;
        for (const w of weeks) {
          const checkThisWeek = ignoreMonthEndCheck || w.isPassed;
          if (checkThisWeek) {
            // Count workouts in this week
            const workoutsInWeek = logs.filter(l => {
              if (l.mission_id !== m.id) return false;
              const d = new Date(l.log_date);
              const ld = new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12, 0, 0);
              return ld >= w.start && ld <= w.end;
            }).length;

            if (workoutsInWeek < 2) {
              hasFailedWeek = true;
              break;
            }
          }
        }
        if (hasFailedWeek) {
          failedMissionsCount++;
        }
      }
    } else if (m.interval === 'monthly') {
      const logCount = uniqueLoggedDays;
      if (logCount < 1) {
        failedMissionsCount++;
      }
    }
  }

  // Calculate Vizyon penalty formula:
  // <= 4 missed: 0 TL
  // 5 missed: 200 TL
  // > 5 missed: 200 + (missed - 5) * 100 TL
  if (failedMissionsCount < 5) {
    return 0;
  } else if (failedMissionsCount === 5) {
    return 200;
  } else {
    return 200 + (failedMissionsCount - 5) * 100;
  }
};

// Helper: Calculate total cumulative penalty of a user from account creation up to current month
const calculateUserCumulativePenalty = async (userId) => {
  const userRes = await pool.query('SELECT created_at FROM users WHERE id = $1', [userId]);
  if (userRes.rows.length === 0) return 0;

  const createdAt = new Date(userRes.rows[0].created_at);
  const startYear = createdAt.getFullYear();
  const startMonth = createdAt.getMonth() + 1;

  const today = getToday();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth() + 1;

  let totalPenalty = 0;
  let y = startYear;
  let m = startMonth;

  while (y < currentYear || (y === currentYear && m <= currentMonth)) {
    const penalty = await calculateUserPenalty(userId, y, m, false);
    totalPenalty += penalty;

    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }

  return totalPenalty;
};

// Helper: Calculate how many missions are completed for a user in a given month/year
const calculateUserCompletedMissionsCount = async (userId, year, month) => {
  // Fetch user's missions
  const missionsRes = await pool.query('SELECT * FROM missions WHERE assigned_to = $1', [userId]);
  const missions = missionsRes.rows;

  if (missions.length === 0) return 0;

  // Fetch all logs of this user for this month
  const logsRes = await pool.query(
    `SELECT mission_id, log_date 
     FROM mission_logs 
     WHERE user_id = $1 
       AND EXTRACT(YEAR FROM log_date) = $2 
       AND EXTRACT(MONTH FROM log_date) = $3`,
    [userId, year, month]
  );
  const logs = logsRes.rows;

  const today = getToday();
  const isCurrentMonth = today.getFullYear() === year && (today.getMonth() + 1) === month;
  let targetDailyDaysCount = new Date(year, month, 0).getDate();
  if (isCurrentMonth) {
    targetDailyDaysCount = today.getDate();
  }

  const weeks = getWeeksInMonth(year, month);
  let completedCount = 0;

  for (const mission of missions) {
    const missionLogs = logs.filter(l => l.mission_id === mission.id);
    const uniqueLoggedDays = [...new Set(missionLogs.map(l => {
      const d = new Date(l.log_date);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }))].length;

    let isCompleted = false;

    if (mission.interval === 'daily') {
      if (mission.title.includes('Namaz')) {
        isCompleted = uniqueLoggedDays >= targetDailyDaysCount;
      } else if (mission.title.includes('Uyku')) {
        isCompleted = uniqueLoggedDays >= 15;
      }
    } else if (mission.interval === 'weekly') {
      if (mission.title.includes('Spor')) {
        let succeededWeeks = 0;
        let failedWeeks = 0;

        for (const w of weeks) {
          const workoutsInWeek = logs.filter(l => {
            if (l.mission_id !== mission.id) return false;
            const ld = new Date(l.log_date);
            const localLd = new Date(ld.getUTCFullYear(), ld.getUTCMonth(), ld.getUTCDate(), 12, 0, 0);
            return localLd >= w.start && localLd <= w.end;
          }).length;

          const isSucceeded = workoutsInWeek >= 2;

          if (w.isPassed) {
            if (isSucceeded) succeededWeeks++;
            else failedWeeks++;
          } else {
            if (isSucceeded) succeededWeeks++;
          }
        }

        isCompleted = failedWeeks === 0 && succeededWeeks === weeks.length;
      }
    } else if (mission.interval === 'monthly') {
      isCompleted = uniqueLoggedDays >= 1;
    }

    if (isCompleted) {
      completedCount++;
    }
  }

  return completedCount;
};

// Helper: Calculate total completed missions count of a user from account creation up to now
const calculateUserAllTimeCompletedMissionsCount = async (userId) => {
  const userRes = await pool.query('SELECT created_at FROM users WHERE id = $1', [userId]);
  if (userRes.rows.length === 0) return 0;

  const createdAt = new Date(userRes.rows[0].created_at);
  const startYear = createdAt.getFullYear();
  const startMonth = createdAt.getMonth() + 1;

  const today = getToday();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth() + 1;

  let totalCompleted = 0;
  let y = startYear;
  let m = startMonth;

  while (y < currentYear || (y === currentYear && m <= currentMonth)) {
    const completed = await calculateUserCompletedMissionsCount(userId, y, m);
    totalCompleted += completed;

    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }

  return totalCompleted;
};

// Helper: Calculate total paid penalty of a user
const calculateUserTotalPaidPenalty = async (userId) => {
  const result = await pool.query(
    'SELECT COALESCE(SUM(amount), 0) as total FROM penalty_payments WHERE user_id = $1',
    [userId]
  );
  return parseFloat(result.rows[0].total);
};

// --- API ROUTES ---

// Server time and date helper (Public)
app.get('/api/time', (req, res) => {
  const now = getToday();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const day = now.getDate();
  const serverDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  const lastDay = new Date(year, month, 0).getDate();
  const isLastDayOfMonth = (day === lastDay);

  res.json({
    serverDate,
    year,
    month,
    day,
    isLastDayOfMonth,
    mockDate: mockServerDate
  });
});

// 1. Auth
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Kullanıcı adı ve şifre gereklidir' });
  }

  try {
    const userRes = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    if (userRes.rows.length === 0) {
      return res.status(401).json({ error: 'Geçersiz bilgiler' });
    }

    const user = userRes.rows[0];
    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Geçersiz bilgiler' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, isAdmin: user.is_admin },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        isAdmin: user.is_admin
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Sunucu hatası' });
  }
});

app.get('/api/auth/me', authenticateToken, async (req, res) => {
  res.json({ user: req.user });
});

// 2. User Management (Admin Only)
app.get('/api/users', authenticateToken, async (req, res) => {
  try {
    const usersRes = await pool.query('SELECT id, username, is_admin, created_at FROM users ORDER BY username ASC');
    res.json(usersRes.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Sunucu hatası' });
  }
});

app.post('/api/users', authenticateToken, requireAdmin, async (req, res) => {
  const { username, password, isAdmin } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Kullanıcı adı ve şifre zorunludur' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Check if user exists
    const userCheck = await client.query('SELECT * FROM users WHERE username = $1', [username]);
    if (userCheck.rows.length > 0) {
      client.release();
      return res.status(400).json({ error: 'Kullanıcı adı zaten kullanımda' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const result = await client.query(
      'INSERT INTO users (username, password_hash, is_admin) VALUES ($1, $2, $3) RETURNING id, username, is_admin, created_at',
      [username, passwordHash, !!isAdmin]
    );

    const newUserId = result.rows[0].id;
    // Seed default missions only if not an admin
    if (!isAdmin) {
      await seedUserMissions(client, newUserId);
    }

    await client.query('COMMIT');
    res.status(201).json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Sunucu hatası' });
  } finally {
    client.release();
  }
});

app.delete('/api/users/:id', authenticateToken, requireAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    if (parseInt(id) === req.user.id) {
      return res.status(400).json({ error: 'Kendi hesabınızı silemezsiniz' });
    }

    await pool.query('DELETE FROM users WHERE id = $1', [id]);
    res.json({ message: 'Kullanıcı silindi' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Sunucu hatası' });
  }
});

// 3. Missions Roster (Calculates progress for the selected month/year)
app.get('/api/missions', authenticateToken, async (req, res) => {
  const { year, month, user_id } = req.query;
  if (!year || !month) {
    return res.status(400).json({ error: 'Yıl ve Ay parametreleri zorunludur' });
  }

  let targetUserId = req.user.id;
  if (req.user.isAdmin && user_id) {
    targetUserId = parseInt(user_id);
  }

  const y = parseInt(year);
  const m = parseInt(month);

  try {
    const missionsRes = await pool.query(
      `SELECT * FROM missions WHERE assigned_to = $1 ORDER BY id ASC`,
      [targetUserId]
    );
    const missions = missionsRes.rows;

    // Fetch all logs of this user for this month
    const logsRes = await pool.query(
      `SELECT mission_id, log_date 
       FROM mission_logs 
       WHERE user_id = $1 
         AND EXTRACT(YEAR FROM log_date) = $2 
         AND EXTRACT(MONTH FROM log_date) = $3`,
      [targetUserId, y, m]
    );
    const logs = logsRes.rows;

    const today = new Date();
    const isCurrentMonth = today.getFullYear() === y && (today.getMonth() + 1) === m;
    let targetDailyDaysCount = new Date(y, m, 0).getDate();
    if (isCurrentMonth) {
      targetDailyDaysCount = today.getDate();
    }

    const weeks = getWeeksInMonth(y, m);

    const missionsWithProgress = missions.map(mission => {
      const missionLogs = logs.filter(l => l.mission_id === mission.id);
      const uniqueLoggedDays = [...new Set(missionLogs.map(l => {
        const d = new Date(l.log_date);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      }))].length;

      let status = 'in_progress'; // 'completed' | 'in_progress' | 'failed'
      let progress_text = '';

      if (mission.interval === 'daily') {
        if (mission.title.includes('Namaz')) {
          const dailyTarget = targetDailyDaysCount;
          progress_text = `${uniqueLoggedDays}/${dailyTarget} Gün`;
          if (uniqueLoggedDays >= dailyTarget) {
            status = 'completed';
          } else {
            status = 'failed';
          }
        } else if (mission.title.includes('Uyku')) {
          progress_text = `${uniqueLoggedDays}/15 Gün`;
          if (uniqueLoggedDays >= 15) {
            status = 'completed';
          } else {
            // Check if still possible to reach 15
            const daysInMonth = new Date(y, m, 0).getDate();
            const daysLeft = isCurrentMonth ? (daysInMonth - today.getDate()) : 0;
            if (uniqueLoggedDays + daysLeft >= 15) {
              status = 'in_progress';
            } else {
              status = 'failed';
            }
          }
        }
      } else if (mission.interval === 'weekly') {
        if (mission.title.includes('Spor')) {
          let succeededWeeks = 0;
          let failedWeeks = 0;

          for (const w of weeks) {
            const workoutsInWeek = logs.filter(l => {
              if (l.mission_id !== mission.id) return false;
              const ld = new Date(l.log_date);
              const localLd = new Date(ld.getUTCFullYear(), ld.getUTCMonth(), ld.getUTCDate(), 12, 0, 0);
              return localLd >= w.start && localLd <= w.end;
            }).length;

            const isSucceeded = workoutsInWeek >= 2;

            if (w.isPassed) {
              if (isSucceeded) succeededWeeks++;
              else failedWeeks++;
            } else {
              if (isSucceeded) succeededWeeks++;
            }
          }

          progress_text = `${succeededWeeks}/${weeks.length} Hafta`;

          if (failedWeeks > 0) {
            status = 'failed';
          } else if (succeededWeeks === weeks.length) {
            status = 'completed';
          } else {
            status = 'in_progress';
          }
        }
      } else if (mission.interval === 'monthly') {
        const isCompleted = uniqueLoggedDays >= 1;
        progress_text = isCompleted ? 'Tamamlandı' : (isCurrentMonth ? 'Rapor Bekliyor' : 'Eksik');
        if (isCompleted) {
          status = 'completed';
        } else {
          if (isCurrentMonth) {
            status = 'in_progress';
          } else {
            status = 'failed';
          }
        }
      }

      return {
        ...mission,
        status,
        is_completed: status === 'completed',
        progress_text
      };
    });

    res.json(missionsWithProgress);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Sunucu hatası' });
  }
});

// 4. Mission Tracking Logs
app.get('/api/missions/logs', authenticateToken, async (req, res) => {
  const { year, month } = req.query;
  if (!year || !month) {
    return res.status(400).json({ error: 'Yıl ve Ay parametreleri zorunludur' });
  }

  try {
    let targetUserId = req.user.id;
    if (req.user.isAdmin && req.query.user_id) {
      targetUserId = parseInt(req.query.user_id);
    }
    const result = await pool.query(
      `SELECT * FROM mission_logs 
       WHERE user_id = $1 
         AND EXTRACT(YEAR FROM log_date) = $2 
         AND EXTRACT(MONTH FROM log_date) = $3`,
      [targetUserId, parseInt(year), parseInt(month)]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Sunucu hatası' });
  }
});

// Toggle log for a mission
app.post('/api/missions/logs/toggle', authenticateToken, async (req, res) => {
  const { mission_id, date } = req.body;
  if (!mission_id || !date) {
    return res.status(400).json({ error: 'Görev ID ve tarih zorunludur' });
  }

  try {
    const today = getToday();
    today.setHours(0, 0, 0, 0);
    const parts = date.split('-');
    const logDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    logDate.setHours(0, 0, 0, 0);

    if (logDate > today) {
      return res.status(400).json({ error: 'Gelecek günleri işaretleyemezsiniz' });
    }

    // Validate mission assignment
    const missionCheck = await pool.query('SELECT * FROM missions WHERE id = $1 AND assigned_to = $2', [mission_id, req.user.id]);
    if (missionCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Bu görev size atanmamış' });
    }

    // Check if log exists
    const logCheck = await pool.query(
      'SELECT * FROM mission_logs WHERE user_id = $1 AND mission_id = $2 AND log_date = $3',
      [req.user.id, mission_id, date]
    );

    if (logCheck.rows.length > 0) {
      // Delete existing log
      await pool.query(
        'DELETE FROM mission_logs WHERE user_id = $1 AND mission_id = $2 AND log_date = $3',
        [req.user.id, mission_id, date]
      );
      res.json({ status: 'removed', mission_id, date });
    } else {
      // Add new log
      await pool.query(
        'INSERT INTO mission_logs (user_id, mission_id, log_date) VALUES ($1, $2, $3)',
        [req.user.id, mission_id, date]
      );
      res.json({ status: 'added', mission_id, date });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Sunucu hatası' });
  }
});

// Save monthly mission log (with text notes)
app.post('/api/missions/logs/monthly', authenticateToken, async (req, res) => {
  const { mission_id, year, month, notes } = req.body;
  if (!mission_id || !year || !month) {
    return res.status(400).json({ error: 'Görev ID, yıl ve ay zorunludur' });
  }

  const dateStr = `${year}-${String(month).padStart(2, '0')}-01`;

  try {
    // Validate mission assignment
    const missionCheck = await pool.query('SELECT * FROM missions WHERE id = $1 AND assigned_to = $2', [mission_id, req.user.id]);
    if (missionCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Bu görev size atanmamış' });
    }

    if (!notes || !notes.trim()) {
      // If notes is cleared, delete the log row representing completion
      await pool.query(
        'DELETE FROM mission_logs WHERE user_id = $1 AND mission_id = $2 AND log_date = $3',
        [req.user.id, mission_id, dateStr]
      );
      res.json({ status: 'removed', mission_id, date: dateStr });
    } else {
      // Upsert the monthly log row with the text details
      await pool.query(
        `INSERT INTO mission_logs (user_id, mission_id, log_date, notes)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, mission_id, log_date)
         DO UPDATE SET notes = EXCLUDED.notes`,
        [req.user.id, mission_id, dateStr, notes.trim()]
      );
      res.json({ status: 'saved', mission_id, date: dateStr, notes: notes.trim() });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Sunucu hatası' });
  }
});

// 5. Vizyon Account & Penalties API
app.get('/api/account', authenticateToken, async (req, res) => {
  const today = new Date();
  const year = req.query.year ? parseInt(req.query.year) : today.getFullYear();
  const month = req.query.month ? parseInt(req.query.month) : today.getMonth() + 1;

  try {
    // 1. Fetch Vizyon Account Balance
    const balanceRes = await pool.query('SELECT balance FROM vizyon_account WHERE id = 1');
    const balance = balanceRes.rows[0]?.balance || 0.00;

    // 2. Fetch list of all users to compute penalties (skip admins for calculation)
    const usersRes = await pool.query('SELECT id, username, is_admin FROM users');
    const users = usersRes.rows;

    let userCumulativePenalty = 0;
    let userTotalPaidPenalty = 0;
    let collectiveCumulativePenalty = 0;
    let forecastedUserPenalty = 0;
    let forecastedCollectivePenalty = 0;
    const detailedPenalties = [];

    // Calculate penalties for all users
    for (const u of users) {
      if (u.is_admin) {
        continue;
      }

      // Calculate cumulative finalized penalty (excludes current month unless it is the last day)
      const totalGeneratedPenalty = await calculateUserCumulativePenalty(u.id);

      // Calculate total paid penalty
      const totalPaidPenalty = await calculateUserTotalPaidPenalty(u.id);

      // Calculate remaining unpaid cumulative penalty
      const remainingPenalty = Math.max(0, totalGeneratedPenalty - totalPaidPenalty);

      // Calculate current month's forecasted penalty (ignoring the month-end lock check)
      const forecastedPenalty = await calculateUserPenalty(u.id, year, month, true);

      // Calculate completed missions count for leaderboard
      const completedMissionsCount = await calculateUserCompletedMissionsCount(u.id, year, month);

      // Calculate all-time completed missions count for all-time leaderboard
      const allTimeCompletedMissionsCount = await calculateUserAllTimeCompletedMissionsCount(u.id);

      detailedPenalties.push({
        username: u.username,
        cumulativePenalty: remainingPenalty,
        forecastedPenalty,
        completedMissionsCount,
        allTimeCompletedMissionsCount
      });

      if (u.id === req.user.id) {
        userCumulativePenalty = remainingPenalty;
        userTotalPaidPenalty = totalPaidPenalty;
        forecastedUserPenalty = forecastedPenalty;
      }
      collectiveCumulativePenalty += remainingPenalty;
      forecastedCollectivePenalty += forecastedPenalty;
    }

    res.json({
      balance: parseFloat(balance),
      userCumulativePenalty,
      userTotalPaidPenalty,
      collectiveCumulativePenalty,
      forecastedUserPenalty,
      forecastedCollectivePenalty,
      detailedPenalties
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Sunucu hatası' });
  }
});

// Test endpoint to override the date dynamically
app.post('/api/test/set-date', (req, res) => {
  const { date } = req.body; // Expects "YYYY-MM-DD" or null
  if (date === null || date === undefined || date === '') {
    mockServerDate = null;
    console.log('Mock server date reset to real system date.');
    return res.json({ message: 'Sistem tarihi gerçek zamana sıfırlandı.', date: null });
  }

  // Basic regex validation for YYYY-MM-DD
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(date)) {
    return res.status(400).json({ error: 'Geçersiz tarih formatı. YYYY-MM-DD formatında olmalıdır.' });
  }

  mockServerDate = date;
  console.log(`Mock server date set to: ${date}`);
  res.json({ message: `Sistem tarihi başarıyla ${date} olarak ayarlandı.`, date });
});

// Pay Penalty API
app.post('/api/payments/pay', authenticateToken, async (req, res) => {
  const { amount } = req.body;
  if (amount === undefined || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
    return res.status(400).json({ error: 'Geçersiz ödeme miktarı' });
  }

  const payAmount = parseFloat(amount);
  const userId = req.user.id;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Calculate current remaining penalty
    const cumulative = await calculateUserCumulativePenalty(userId);
    const paid = await calculateUserTotalPaidPenalty(userId);
    const remaining = Math.max(0, cumulative - paid);

    if (payAmount > remaining) {
      client.release();
      return res.status(400).json({ error: `Ödeme miktarı kalan cezanızı (${remaining} TL) aşamaz.` });
    }

    // Insert payment record
    await client.query(
      'INSERT INTO penalty_payments (user_id, amount) VALUES ($1, $2)',
      [userId, payAmount]
    );

    // Add to Vizyon Account balance
    await client.query(
      'UPDATE vizyon_account SET balance = balance + $1 WHERE id = 1',
      [payAmount]
    );

    await client.query('COMMIT');
    res.json({ message: 'Ödeme başarıyla gerçekleştirildi', paidAmount: payAmount });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Ödeme işlemi sırasında bir hata oluştu' });
  } finally {
    client.release();
  }
});

// Adjust Vizyon Account Balance (Admin Only)
app.post('/api/account/adjust', authenticateToken, requireAdmin, async (req, res) => {
  const { amount, type } = req.body; // type: 'add' | 'subtract' | 'set'
  if (amount === undefined || isNaN(parseFloat(amount))) {
    return res.status(400).json({ error: 'Geçersiz miktar' });
  }

  const val = parseFloat(amount);

  try {
    let result;
    if (type === 'add') {
      result = await pool.query(
        'UPDATE vizyon_account SET balance = balance + $1 WHERE id = 1 RETURNING balance',
        [val]
      );
    } else if (type === 'subtract') {
      result = await pool.query(
        'UPDATE vizyon_account SET balance = balance - $1 WHERE id = 1 RETURNING balance',
        [val]
      );
    } else {
      result = await pool.query(
        'UPDATE vizyon_account SET balance = $1 WHERE id = 1 RETURNING balance',
        [val]
      );
    }

    res.json({ balance: parseFloat(result.rows[0].balance) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Sunucu hatası' });
  }
});

app.listen(PORT, () => {
  console.log(`Backend server running on port ${PORT}`);
});
