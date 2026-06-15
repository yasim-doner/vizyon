import { useState, useEffect } from 'react';
import './App.css';

const API_BASE = '/api';

function App() {
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [currentUser, setCurrentUser] = useState(null);
  
  // Login states
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // App data states
  const [missions, setMissions] = useState([]);
  const [users, setUsers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedUserUsername, setSelectedUserUsername] = useState('');
  
  // Calendar states
  const [currentDate, setCurrentDate] = useState(new Date());
  const [missionLogs, setMissionLogs] = useState([]); // [{ mission_id, log_date }]
  const [selectedMission, setSelectedMission] = useState(null);
  const [monthlyInputText, setMonthlyInputText] = useState('');

  // Leaderboard states
  const [leaderboardDate, setLeaderboardDate] = useState(new Date());
  const [leaderboardPenalties, setLeaderboardPenalties] = useState([]);

  const [serverDateStr, setServerDateStr] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });

  const getServerTodayAndYesterday = () => {
    if (!serverDateStr) {
      const today = new Date();
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const tStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      const yStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
      return { today, yesterday, todayStr: tStr, yesterdayStr: yStr };
    }
    const parts = serverDateStr.split('-');
    const today = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]), 12, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const todayStr = serverDateStr;
    const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
    return { today, yesterday, todayStr, yesterdayStr };
  };

  useEffect(() => {
    fetch(`${API_BASE}/time`)
      .then(res => res.json())
      .then(data => {
        setServerDateStr(data.serverDate);
        
        let initYear = data.year;
        let initMonthIndex = data.month - 1;
        // Clamp to July 2026 (Month index 6)
        if (initYear < 2026 || (initYear === 2026 && initMonthIndex < 6)) {
          initYear = 2026;
          initMonthIndex = 6;
        }
        const initialDate = new Date(initYear, initMonthIndex, 1);
        setCurrentDate(initialDate);
        setLeaderboardDate(initialDate);
      })
      .catch(err => console.error('Sunucu saati alınamadı:', err));
  }, []);

  useEffect(() => {
    if (selectedMission && selectedMission.interval === 'monthly') {
      const log = missionLogs.find(l => l.mission_id === selectedMission.id);
      setMonthlyInputText(log ? log.notes || '' : '');
    } else {
      setMonthlyInputText('');
    }
  }, [selectedMission, missionLogs, currentDate]);

  // Account details
  const [accountBalance, setAccountBalance] = useState(0);
  const [userCumulativePenalty, setUserCumulativePenalty] = useState(0);
  const [userTotalPaidPenalty, setUserTotalPaidPenalty] = useState(0);
  const [collectiveCumulativePenalty, setCollectiveCumulativePenalty] = useState(0);
  const [forecastedUserPenalty, setForecastedUserPenalty] = useState(0);
  const [forecastedCollectivePenalty, setForecastedCollectivePenalty] = useState(0);
  const [detailedPenalties, setDetailedPenalties] = useState([]);

  // Payment state
  const [paymentAmountInput, setPaymentAmountInput] = useState('');

  // Admin adjustments
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustType, setAdjustType] = useState('add'); // 'add' | 'subtract' | 'set'

  // Admin panel tab
  const [activeTab, setActiveTab] = useState('missions'); // 'missions' | 'members' | 'account'
  
  // Member add form state
  const [newUsername, setNewUsername] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserIsAdmin, setNewUserIsAdmin] = useState(false);

  // Notification Toast state
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });

  // Background slideshow for landing page
  const [bgIndex, setBgIndex] = useState(0);
  const backgroundImages = [
    '/gallery/bg1.jpg',
    '/gallery/bg2.jpg',
    '/gallery/bg3.jpg',
    '/gallery/bg4.jpg'
  ];

  useEffect(() => {
    if (currentUser) return;
    const interval = setInterval(() => {
      setBgIndex((prev) => (prev + 1) % backgroundImages.length);
    }, 6000);
    return () => clearInterval(interval);
  }, [currentUser]);

  // Show Toast helper
  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => {
      setToast({ show: false, message: '', type: 'success' });
    }, 4000);
  };

  // Fetch current user details
  useEffect(() => {
    if (token) {
      fetch(`${API_BASE}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then(res => {
          if (!res.ok) throw new Error('Oturum süresi doldu');
          return res.json();
        })
        .then(data => {
          setCurrentUser(data.user);
          setSelectedUserId(data.user.id);
          setSelectedUserUsername(data.user.username);
        })
        .catch(err => {
          console.error(err);
          handleLogout();
        });
    } else {
      setCurrentUser(null);
    }
  }, [token]);

  // Fetch data
  useEffect(() => {
    if (currentUser) {
      fetchAccountDetails();
      if (currentUser.isAdmin) {
        fetchUsers();
      }
    }
  }, [currentUser, currentDate]);

  // Fetch missions when target user or month changes
  useEffect(() => {
    if (currentUser && selectedUserId) {
      fetchMissions();
    }
  }, [currentUser, selectedUserId, currentDate]);

  // Fetch logs when selected mission or month changes
  useEffect(() => {
    if (currentUser && selectedUserId) {
      fetchLogs();
    }
  }, [currentUser, selectedUserId, currentDate]);

  const fetchAccountDetails = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth() + 1;
    fetch(`${API_BASE}/account?year=${year}&month=${month}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => {
        if (data.balance !== undefined) {
          setAccountBalance(data.balance);
          setUserCumulativePenalty(data.userCumulativePenalty || 0);
          setUserTotalPaidPenalty(data.userTotalPaidPenalty || 0);
          setCollectiveCumulativePenalty(data.collectiveCumulativePenalty || 0);
          setForecastedUserPenalty(data.forecastedUserPenalty || 0);
          setForecastedCollectivePenalty(data.forecastedCollectivePenalty || 0);
          setDetailedPenalties(data.detailedPenalties || []);
        }
      })
      .catch(err => console.error('Hesap bilgileri alınamadı:', err));
  };

  const fetchLeaderboardDetails = () => {
    if (!token) return;
    const year = leaderboardDate.getFullYear();
    const month = leaderboardDate.getMonth() + 1;
    fetch(`${API_BASE}/account?year=${year}&month=${month}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => {
        if (data.detailedPenalties !== undefined) {
          setLeaderboardPenalties(data.detailedPenalties || []);
        }
      })
      .catch(err => console.error('Liderlik tablosu bilgileri alınamadı:', err));
  };

  // Fetch leaderboard details when user, token or leaderboard date changes
  useEffect(() => {
    if (currentUser && token) {
      fetchLeaderboardDetails();
    }
  }, [currentUser, token, leaderboardDate]);

  const fetchUsers = () => {
    fetch(`${API_BASE}/users`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setUsers(data);
          // Set tracking default for admin to the first non-admin member
          const nonAdmins = data.filter(u => !u.is_admin);
          if (nonAdmins.length > 0) {
            setSelectedUserId(nonAdmins[0].id);
            setSelectedUserUsername(nonAdmins[0].username);
          } else {
            setSelectedUserId('');
            setSelectedUserUsername('');
          }
        }
      })
      .catch(err => console.error('Üyeler yüklenemedi:', err));
  };

  const fetchMissions = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth() + 1;
    const userIdQuery = selectedUserId ? `&user_id=${selectedUserId}` : '';

    fetch(`${API_BASE}/missions?year=${year}&month=${month}${userIdQuery}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setMissions(data);
          // Synchronize selectedMission state with updated items
          if (selectedMission) {
            const updated = data.find(m => m.id === selectedMission.id);
            if (updated) {
              setSelectedMission(updated);
            }
          } else if (data.length > 0) {
            setSelectedMission(data[0]);
          }
        }
      })
      .catch(err => console.error('Görevler yüklenemedi:', err));
  };

  const fetchLogs = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth() + 1;
    
    // For admin to fetch logs of another user, they need to pass it, but since we want to support
    // other users' logs, wait! The backend endpoint is:
    // `GET /api/missions/logs?year=...&month=...` which queries logs for `req.user.id`.
    // Wait, let's look at the backend endpoint we wrote:
    // `SELECT * FROM mission_logs WHERE user_id = $1 ...` where $1 is `req.user.id`.
    // Ah! To support admin viewing logs of other members, we need to allow the admin to pass a `user_id` query param!
    // Let's check: did we write that in backend?
    // Wait, in `backend/index.js`, we did:
    // `WHERE user_id = $1` with `[req.user.id, ...]`.
    // Ah! We didn't support a `user_id` param in `GET /api/missions/logs` in the backend.
    // Let's modify the backend API slightly to allow admins to query other users' logs by passing `user_id` query parameter!
    // Yes! Let's do that right away, but first, let's write the fetch query here expecting to support it:
    const userIdQuery = selectedUserId !== currentUser?.id ? `&user_id=${selectedUserId}` : '';
    fetch(`${API_BASE}/missions/logs?year=${year}&month=${month}${userIdQuery}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setMissionLogs(data);
        }
      })
      .catch(err => console.error('Günlükler yüklenemedi:', err));
  };

  const handleLogin = (e) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setLoginError('Lütfen tüm alanları doldurun');
      return;
    }

    setLoginError('');
    setIsLoading(true);

    fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    })
      .then(res => {
        setIsLoading(false);
        if (!res.ok) {
          return res.json().then(data => {
            throw new Error(data.error || 'Giriş başarısız');
          });
        }
        return res.json();
      })
      .then(data => {
        localStorage.setItem('token', data.token);
        setToken(data.token);
        setCurrentUser(data.user);
        setSelectedUserId(data.user.id);
        setSelectedUserUsername(data.user.username);
        showToast(`Tekrar hoş geldin, ${data.user.username}!`, 'success');
      })
      .catch(err => {
        setIsLoading(false);
        setLoginError(err.message);
      });
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    setToken('');
    setCurrentUser(null);
    setMissions([]);
    setUsers([]);
    setSelectedMission(null);
    setMissionLogs([]);
    setUsername('');
    setPassword('');
    showToast('Oturum kapatıldı', 'info');
  };

  // Toggle log for a day
  const handleToggleDay = (dayNum) => {
    // Only the assigned member can toggle their own calendar logs
    if (selectedUserId !== currentUser.id) {
      showToast('Sadece kendi görevlerinizi işaretleyebilirsiniz!', 'error');
      return;
    }

    if (!selectedMission) return;

    const { todayStr } = getServerTodayAndYesterday();
    const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;

    if (dateStr > todayStr) {
      showToast('Gelecek günleri işaretleyemezsiniz!', 'error');
      return;
    }

    fetch(`${API_BASE}/missions/logs/toggle`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        mission_id: selectedMission.id,
        date: dateStr
      })
    })
      .then(res => {
        if (!res.ok) throw new Error('İşlem gerçekleştirilemedi');
        return res.json();
      })
      .then(data => {
        // Toggle locally
        if (data.status === 'added') {
          setMissionLogs(prev => [...prev, { mission_id: selectedMission.id, log_date: dateStr }]);
          showToast('İşaretlendi', 'success');
        } else {
          setMissionLogs(prev => prev.filter(l => {
            const formattedLd = l.log_date.substring(0, 10);
            return !(l.mission_id === selectedMission.id && formattedLd === dateStr);
          }));
          showToast('İşaret kaldırıldı', 'info');
        }
        // Refresh account details, logs and missions
        fetchMissions();
        fetchAccountDetails();
        fetchLeaderboardDetails();
      })
      .catch(err => showToast(err.message, 'error'));
  };

  // Save monthly mission details
  const handleSaveMonthly = (e) => {
    e.preventDefault();
    if (!selectedMission) return;

    // Disallow saving for other users
    if (selectedUserId !== currentUser.id) {
      showToast('Sadece kendi görevlerinizi kaydedebilirsiniz!', 'error');
      return;
    }

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth() + 1;

    fetch(`${API_BASE}/missions/logs/monthly`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        mission_id: selectedMission.id,
        year,
        month,
        notes: monthlyInputText
      })
    })
      .then(res => {
        if (!res.ok) throw new Error('Aylık veri kaydedilemedi');
        return res.json();
      })
      .then(data => {
        if (data.status === 'saved') {
          showToast('Aylık göreviniz kaydedildi!', 'success');
        } else {
          showToast('Aylık göreviniz sıfırlandı.', 'info');
        }
        fetchLogs();
        fetchMissions();
        fetchAccountDetails();
        fetchLeaderboardDetails();
      })
      .catch(err => showToast(err.message, 'error'));
  };

  // Adjust Vizyon Account (Admin Only)
  const handleAdjustAccount = (e) => {
    e.preventDefault();
    if (!adjustAmount.trim() || isNaN(parseFloat(adjustAmount))) {
      showToast('Geçerli bir miktar girin', 'error');
      return;
    }

    fetch(`${API_BASE}/account/adjust`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        amount: parseFloat(adjustAmount),
        type: adjustType
      })
    })
      .then(res => {
        if (!res.ok) throw new Error('Kasa güncellenemedi');
        return res.json();
      })
      .then(data => {
        setAccountBalance(data.balance);
        setAdjustAmount('');
        showToast('Vizyon Hesabı güncellendi', 'success');
        fetchAccountDetails(); // Sync penalties
        fetchLeaderboardDetails();
      })
      .catch(err => showToast(err.message, 'error'));
  };

  // Pay Penalty
  const handlePayPenalty = (e) => {
    e.preventDefault();
    if (!paymentAmountInput.trim() || isNaN(parseFloat(paymentAmountInput))) {
      showToast('Geçerli bir miktar girin', 'error');
      return;
    }

    const payAmount = parseFloat(paymentAmountInput);
    if (payAmount <= 0) {
      showToast('Ödeme miktarı 0\'dan büyük olmalıdır', 'error');
      return;
    }
    if (payAmount > userCumulativePenalty) {
      showToast('Kalan ceza borcunuzdan fazla ödeme yapamazsınız', 'error');
      return;
    }

    fetch(`${API_BASE}/payments/pay`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ amount: payAmount })
    })
      .then(res => {
        if (!res.ok) {
          return res.json().then(data => {
            throw new Error(data.error || 'Ödeme gerçekleştirilemedi');
          });
        }
        return res.json();
      })
      .then(data => {
        showToast(`${payAmount} TL ceza ödemesi başarıyla kaydedildi!`, 'success');
        setPaymentAmountInput('');
        fetchAccountDetails();
        fetchLeaderboardDetails();
      })
      .catch(err => showToast(err.message, 'error'));
  };


  // Add Member (Admin)
  const handleAddUser = (e) => {
    e.preventDefault();
    if (!newUsername.trim() || !newUserPassword.trim()) {
      showToast('Kullanıcı adı ve şifre gereklidir', 'error');
      return;
    }

    fetch(`${API_BASE}/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        username: newUsername,
        password: newUserPassword,
        isAdmin: newUserIsAdmin
      })
    })
      .then(res => {
        if (!res.ok) {
          return res.json().then(data => {
            throw new Error(data.error || 'Üye eklenemedi');
          });
        }
        return res.json();
      })
      .then(() => {
        showToast('Üye başarıyla eklendi', 'success');
        setNewUsername('');
        setNewUserPassword('');
        setNewUserIsAdmin(false);
        fetchUsers();
        fetchAccountDetails(); // Sync penalty stats
        fetchLeaderboardDetails();
      })
      .catch(err => showToast(err.message, 'error'));
  };

  // Delete Member (Admin)
  const handleDeleteUser = (userId) => {
    if (!confirm('Bu üyeyi silmek istediğinize emin misiniz? Bütün verileri silinecektir!')) return;

    fetch(`${API_BASE}/users/${userId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => {
        if (!res.ok) {
          return res.json().then(data => {
            throw new Error(data.error || 'Üye silinemedi');
          });
        }
        return res.json();
      })
      .then(() => {
        showToast('Üye silindi', 'success');
        if (selectedUserId === userId) {
          setSelectedUserId(currentUser.id);
          setSelectedUserUsername(currentUser.username);
        }
        fetchUsers();
        fetchAccountDetails(); // Sync penalties
        fetchLeaderboardDetails();
      })
      .catch(err => showToast(err.message, 'error'));
  };

  // --- STREAK & CALENDAR CALCULATORS ---

  const getDaysInMonth = (year, month) => new Date(year, month, 0).getDate();

  const getWeeksInMonth = (year, month) => {
    const { today } = getServerTodayAndYesterday();
    const compareToday = new Date(today);
    compareToday.setHours(0, 0, 0, 0);

    const weeks = [];
    const firstDay = new Date(year, month - 1, 1, 12, 0, 0);
    const lastDay = new Date(year, month, 0, 12, 0, 0);

    let current = new Date(firstDay);
    const dayOfWeek = current.getDay();
    const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    current.setDate(current.getDate() + diff);

    while (current <= lastDay) {
      const start = new Date(current);
      start.setHours(0, 0, 0, 0);
      const end = new Date(current);
      end.setDate(end.getDate() + 6);
      end.setHours(23, 59, 59, 999);

      const isPassed = end < compareToday;

      if (end >= firstDay && start <= lastDay) {
        weeks.push({ start, end, isPassed });
      }

      current.setDate(current.getDate() + 7);
    }
    return weeks;
  };

  const getMonthNameTurkish = (monthIndex) => {
    const months = [
      'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 
      'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'
    ];
    return months[monthIndex];
  };

  const getMonthlyLabels = (title) => {
    if (!title) return { label: 'Görev Detayı', placeholder: 'Detayları girin...' };
    if (title.includes('Kitap')) {
      return {
        label: 'Okuduğunuz Kitabın Adı ve Yazarı',
        placeholder: 'Örn: Sefiller - Victor Hugo'
      };
    }
    if (title.includes('Makale')) {
      return {
        label: 'Anlayarak Okuduğunuz 2 Makalenin Konusu/Başlığı',
        placeholder: 'Örn: 1. Yapay Zeka Devrimi, 2. Kuantum Fiziğine Giriş'
      };
    }
    if (title.includes('Video')) {
      return {
        label: 'İzlediğiniz 2 Faydalı Videonun Başlığı/Konusu',
        placeholder: 'Örn: 1. Zaman Yönetimi Metotları, 2. Etkili Konuşma Sanatı'
      };
    }
    if (title.includes('Şiir')) {
      return {
        label: 'Ezberlediğiniz Şiirin Adı ve Şairi',
        placeholder: 'Örn: Sakarya Türküsü - Necip Fazıl Kısakürek'
      };
    }
    if (title.includes('Kelime')) {
      return {
        label: 'Öğrendiğiniz 10 Yabancı Kelime ve Anlamları',
        placeholder: 'Örn: 1. Resilient (Esnek), 2. Ubiquitous (Her yerde bulunan)...'
      };
    }
    if (title.includes('Hatır')) {
      return {
        label: 'Halini Hatırını Sorduğunuz Vizyon Üyesinin Adı',
        placeholder: 'Örn: Ahmet Yılmaz'
      };
    }
    if (title.includes('Film')) {
      return {
        label: 'İzlediğiniz Filmin Adı',
        placeholder: 'Örn: Yıldızlararası (Interstellar)'
      };
    }
    return {
      label: 'Görev Rapor Detayı',
      placeholder: 'Görevi nasıl tamamladığınıza dair bilgileri yazın...'
    };
  };

  const handlePrevMonth = () => {
    setCurrentDate(prev => {
      const targetDate = new Date(prev.getFullYear(), prev.getMonth() - 1, 1);
      // Temmuz 2026 öncesine (Yıl < 2026 veya Yıl == 2026 ve Ay < 6) izin verme
      if (targetDate.getFullYear() < 2026 || (targetDate.getFullYear() === 2026 && targetDate.getMonth() < 6)) {
        showToast("Temmuz 2026'dan önceki aylara gidemezsiniz!", "info");
        return prev;
      }
      return targetDate;
    });
  };

  const handleNextMonth = () => {
    setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  // Helper to extract log string list for the selected mission in current month
  const getMissionLogsList = () => {
    if (!selectedMission) return [];
    return missionLogs
      .filter(l => l.mission_id === selectedMission.id)
      .map(l => {
        return l.log_date.substring(0, 10);
      });
  };

  // Streak Calculation
  const calculateStreak = () => {
    if (!selectedMission) return { current: 0, max: 0 };
    
    const logsList = getMissionLogsList();
    if (logsList.length === 0) return { current: 0, max: 0 };

    const sortedDates = [...new Set(logsList)].sort();

    // Calculate current streak
    let currentStreak = 0;
    const { today, yesterday, todayStr, yesterdayStr } = getServerTodayAndYesterday();

    const hasToday = sortedDates.includes(todayStr);
    const hasYesterday = sortedDates.includes(yesterdayStr);

    if (hasToday || hasYesterday) {
      let checkDate = hasToday 
        ? new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12, 0, 0)
        : new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 12, 0, 0);
      while (true) {
        const checkStr = `${checkDate.getFullYear()}-${String(checkDate.getMonth() + 1).padStart(2, '0')}-${String(checkDate.getDate()).padStart(2, '0')}`;
        if (sortedDates.includes(checkStr)) {
          currentStreak++;
          checkDate.setDate(checkDate.getDate() - 1);
        } else {
          break;
        }
      }
    }

    // Calculate max streak
    let maxStreak = 0;
    let tempStreak = 0;
    let prevDate = null;

    for (const dStr of sortedDates) {
      const parts = dStr.split('-');
      const currDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]), 12, 0, 0);
      if (prevDate === null) {
        tempStreak = 1;
      } else {
        const diffTime = Math.abs(currDate - prevDate);
        const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
        if (diffDays === 1) {
          tempStreak++;
        } else if (diffDays > 1) {
          if (tempStreak > maxStreak) maxStreak = tempStreak;
          tempStreak = 1;
        }
      }
      prevDate = currDate;
    }
    if (tempStreak > maxStreak) maxStreak = tempStreak;

    return { current: currentStreak, max: maxStreak };
  };

  const { current: currentStreak, max: maxStreak } = calculateStreak();

  // Calendar rendering helper: Get calendar weeks list (Mon-Sun layout)
  const renderCalendarCells = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const totalDays = getDaysInMonth(year, month + 1);
    
    // Day of week for 1st of month (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
    const firstDayIndex = new Date(year, month, 1).getDay();
    // Adjust to Monday = 0, Sunday = 6
    const startOffset = firstDayIndex === 0 ? 6 : firstDayIndex - 1;

    const cells = [];
    
    // Empty cells for offset
    for (let i = 0; i < startOffset; i++) {
      cells.push(<div key={`empty-${i}`} className="calendar-cell empty"></div>);
    }

    const logsList = getMissionLogsList();
    const { todayStr } = getServerTodayAndYesterday();

    // Actual days
    for (let day = 1; day <= totalDays; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const isCompleted = logsList.includes(dateStr);
      
      // Check left and right neighbor for streak connection line styling
      const prevDateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day - 1).padStart(2, '0')}`;
      const nextDateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day + 1).padStart(2, '0')}`;
      
      const hasLeft = isCompleted && logsList.includes(prevDateStr) && (new Date(dateStr).getDay() !== 1); // Not Monday
      const hasRight = isCompleted && logsList.includes(nextDateStr) && (new Date(dateStr).getDay() !== 0); // Not Sunday

      const isFuture = dateStr > todayStr;
      const isToday = dateStr === todayStr;

      let cellClass = isFuture ? 'calendar-cell day-future' : 'calendar-cell day-active';
      if (isCompleted) cellClass += ' completed';
      if (hasLeft) cellClass += ' conn-left';
      if (hasRight) cellClass += ' conn-right';
      if (isToday) cellClass += ' is-today';

      cells.push(
        <div 
          key={`day-${day}`} 
          className={cellClass}
          onClick={() => handleToggleDay(day)}
        >
          <span className="day-number">{day}</span>
          {isCompleted && <span className="completed-check">✓</span>}
        </div>
      );
    }

    return cells;
  };

  // Weekly workout status helper
  const getWeeklyWorkoutsReport = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth() + 1;
    const weeks = getWeeksInMonth(year, month);
    const logsList = getMissionLogsList();

    return weeks.map((w, idx) => {
      // Find logs inside this week range
      const workouts = logsList.filter(lStr => {
        const parts = lStr.split('-');
        const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]), 12, 0, 0);
        return d >= w.start && d <= w.end;
      }).length;

      const isSucceeded = workouts >= 2;
      let statusClass = 'week-badge';
      if (isSucceeded) statusClass += ' status-completed';
      else if (w.isPassed) statusClass += ' status-pending';
      else statusClass += ' status-progress';

      return (
        <div key={`week-report-${idx}`} className="week-report-item">
          <span className="week-label">{idx + 1}. Hafta ({w.start.getDate()} - {w.end.getDate()} {getMonthNameTurkish(w.end.getMonth())})</span>
          <span className={statusClass}>
            {workouts} / 2 Gün {isSucceeded ? '✓' : w.isPassed ? 'Eksik' : 'Devam Ediyor'}
          </span>
        </div>
      );
    });
  };

  // Monthly status percentage
  const getMonthlyTargetStatus = () => {
    if (!selectedMission) return null;
    const logsCount = getMissionLogsList().length;
    const isSucceeded = selectedMission.is_completed || selectedMission.status === 'completed';

    if (selectedMission.title.includes('Makale') || selectedMission.title.includes('Video')) {
      return (
        <div className={`target-result ${isSucceeded ? 'success' : 'fail'}`} style={{ fontWeight: '600', fontSize: '0.95rem' }}>
          Durum: {isSucceeded ? 'Hedef Başarıldı! (Rapor Girildi)' : 'Eksik (Rapor Bekleniyor)'}
        </div>
      );
    } else if (selectedMission.title.includes('Uyku')) {
      return (
        <div className={`target-result ${isSucceeded ? 'success' : 'fail'}`} style={{ fontWeight: '600', fontSize: '0.95rem' }}>
          Durum: Korunan Gün Sayısı: {logsCount} / 15 ({isSucceeded ? 'Hedef Başarıldı!' : 'Eksik'})
        </div>
      );
    } else {
      return (
        <div className={`target-result ${isSucceeded ? 'success' : 'fail'}`} style={{ fontWeight: '600', fontSize: '0.95rem' }}>
          Durum: {isSucceeded ? 'Tamamlandı ✓' : 'Tamamlanmadı'}
        </div>
      );
    }
  };

  // --- RENDER PUBLIC LANDING PAGE ---
  if (!currentUser) {
    return (
      <div className="landing-page" id="page-top">
        {/* Navigation */}
        <nav className="landing-nav">
          <div className="landing-nav-container">
            <a href="#page-top" className="landing-logo">
              <img src="/icon.png" alt="Vizyon Logo" style={{ width: '28px', height: '28px', borderRadius: '4px' }} />
              VİZYON
            </a>
            <ul className="landing-nav-links">
              <li><a href="#about" className="landing-nav-link">Hakkımızda</a></li>
              <li><a href="#login" className="landing-nav-link nav-cta">Giriş Yap</a></li>
            </ul>
          </div>
        </nav>

        {/* Masthead (Hero) */}
        <header className="landing-masthead" style={{ position: 'relative', overflow: 'hidden' }}>
          {backgroundImages.map((img, idx) => (
            <div
              key={idx}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundImage: `linear-gradient(rgba(10, 11, 14, 0.65), rgba(10, 11, 14, 0.85)), url(${img})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                transform: `translateX(${(idx - bgIndex) * 100}%)`,
                transition: 'transform 1.2s cubic-bezier(0.4, 0, 0.2, 1)',
                zIndex: 1
              }}
            />
          ))}
          <div className="masthead-content" style={{ position: 'relative', zIndex: 2 }}>
            <h1 className="masthead-title" style={{ color: '#ffffff' }}>VİZYON</h1>
            <h2 className="masthead-subtitle" style={{ color: 'rgba(255, 255, 255, 0.85)' }}>
              Disiplin, kararlılık ve gelişim odaklı görev ve alışkanlık takip sistemi.
            </h2>
            <a href="#login" className="btn btn-primary btn-lg">Hemen Başla</a>
          </div>
        </header>

        {/* About Section */}
        <section className="landing-about" id="about">
          <div className="about-content">
            <h2 className="section-title">HAKKIMIZDA</h2>
            <p className="about-text">
              Vizyon, üyelerinin hayat kalitesini, disiplinini ve entelektüel birikimini artırmayı hedefleyen bir topluluktur. 
              Sistem dahilinde belirlenen 10 temel görevin günlük, haftalık ve aylık olarak takibi yapılır. 
              Gruptaki her üye sorumluluklarını yerine getirmekle yükümlüdür. Aksatılan görevler durumunda ortak Vizyon Hesabı havuzuna ceza katkısı sağlanır.
            </p>
          </div>
        </section>

        {/* Embedded Login Section */}
        <section className="landing-login-section" id="login">
          <div className="login-form-wrapper">
            <h2 className="login-form-title">Giriş Yap</h2>
            <p className="login-form-subtitle">Sisteme erişmek için kimlik bilgilerinizi girin.</p>
            
            <form onSubmit={handleLogin} className="login-form">
              {loginError && <div className="error-banner">{loginError}</div>}
              
              <div className="form-group">
                <label htmlFor="login-username">Kullanıcı Adı</label>
                <input
                  id="login-username"
                  type="text"
                  placeholder="Kullanıcı adınızı girin"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  disabled={isLoading}
                />
              </div>
              
              <div className="form-group">
                <label htmlFor="login-password">Şifre</label>
                <input
                  id="login-password"
                  type="password"
                  placeholder="Şifrenizi girin"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  disabled={isLoading}
                />
              </div>
              
              <button type="submit" className="btn btn-primary btn-block" disabled={isLoading}>
                {isLoading ? 'Giriş yapılıyor...' : 'Giriş Yap'}
              </button>
            </form>
          </div>
        </section>

        {/* Contact/Coordinator Section (Footer Only) */}
        <section className="landing-contact">
          <footer className="landing-footer">
            <p>Copyright &copy; Vizyon Grubu 2026</p>
          </footer>
        </section>
      </div>
    );
  }

  // --- RENDER DASHBOARD ---
  return (
    <div className="dashboard-container">
      {/* Header */}
      <header className="dashboard-header">
        <div className="header-logo" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <img src="/icon.png" alt="Vizyon Logo" style={{ width: '28px', height: '28px', borderRadius: '4px' }} />
          <span className="logo-text">VİZYON</span>
        </div>

        {/* Dynamic Financial Overview Panel */}
        <div className="financial-panel">
          <div className="financial-card card-kasa">
            <span className="financial-title">VİZYON HESABI</span>
            <span className="financial-amount">{accountBalance.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL</span>
          </div>
          <div className="financial-card card-bireysel">
            <span className="financial-title">KİŞİSEL TOPLAM CEZANIZ</span>
            <span className="financial-amount text-danger">
              {currentUser.isAdmin ? 'Muaf (Yönetici)' : `${userCumulativePenalty} TL`}
            </span>
            {!currentUser.isAdmin && (
              <span className="financial-subtext">
                Bu ayki olası ek ceza: +{forecastedUserPenalty} TL
              </span>
            )}
          </div>
          <div className="financial-card card-tüm-üyeler">
            <span className="financial-title">GRUP TOPLAM CEZASI</span>
            <span className="financial-amount text-warning">{collectiveCumulativePenalty} TL</span>
            <span className="financial-subtext">
              Bu ayki olası ek ceza: +{forecastedCollectivePenalty} TL
            </span>
          </div>
        </div>
        
        <div className="header-actions">

          <div className="user-profile">
            <div className="user-avatar">{currentUser.username[0].toUpperCase()}</div>
            <div className="user-info">
              <span className="user-name">{currentUser.username}</span>
              <span className="user-role">{currentUser.isAdmin ? 'Yönetici' : 'Grup Üyesi'}</span>
            </div>
          </div>
          
          <button onClick={handleLogout} className="btn btn-danger btn-logout">
            Çıkış
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="dashboard-main">
        {/* Admin and User Navigation Tabs */}
        <div className="dashboard-navigation">
          <button 
            onClick={() => setActiveTab('missions')} 
            className={`tab-btn ${activeTab === 'missions' ? 'active' : ''}`}
          >
            Görev Takvimleri
          </button>
          <button 
            onClick={() => setActiveTab('leaderboard')} 
            className={`tab-btn ${activeTab === 'leaderboard' ? 'active' : ''}`}
          >
            Liderlik Tablosu
          </button>
          <button 
            onClick={() => setActiveTab('pay-penalty')} 
            className={`tab-btn ${activeTab === 'pay-penalty' ? 'active' : ''}`}
          >
            Ceza Öde
          </button>
          
          {currentUser.isAdmin && (
            <>
              <button 
                onClick={() => setActiveTab('members')} 
                className={`tab-btn ${activeTab === 'members' ? 'active' : ''}`}
              >
                Üye Listesi & Kayıt
              </button>
              <button 
                onClick={() => setActiveTab('account')} 
                className={`tab-btn ${activeTab === 'account' ? 'active' : ''}`}
              >
                Vizyon Hesabı Yönetimi
              </button>
            </>
          )}
        </div>

        {/* Tab 1: Mission tracking board */}
        {activeTab === 'missions' && (
          <div className="dashboard-grid">
            
            {/* Sidebar list of missions */}
            <div className="grid-column sidebar-column">
              {/* Member Selection for Admin (Inspection mode) */}
              {currentUser.isAdmin && (
                <div className="panel-card user-selector-card">
                  <h2 className="panel-title">Takip Edilen Üye</h2>
                  <div className="form-group">
                    <select 
                      value={selectedUserId} 
                      onChange={e => {
                        if (!e.target.value) return;
                        const uid = parseInt(e.target.value);
                        setSelectedUserId(uid);
                        const selectedUserObj = users.find(u => u.id === uid);
                        if (selectedUserObj) {
                          setSelectedUserUsername(selectedUserObj.username);
                        }
                      }}
                    >
                      <option value="">Üye Seçin...</option>
                      {users.filter(u => !u.is_admin).map(u => (
                        <option key={u.id} value={u.id}>
                          {u.username}
                        </option>
                      ))}
                    </select>
                  </div>
                  {selectedUserId && (
                    <div className="inspection-notice">
                      Şu anda <strong>{selectedUserUsername}</strong> adlı üyenin verilerini inceliyorsunuz (Salt okunur mod).
                    </div>
                  )}
                </div>
              )}

              <div className="panel-card">
                <h2 className="panel-title">10 Temel Görev</h2>
                <div className="missions-menu">
                  {missions.map(m => (
                    <button
                      key={m.id}
                      onClick={() => setSelectedMission(m)}
                      className={`menu-item-btn ${selectedMission?.id === m.id ? 'active' : ''} item-${m.status}`}
                    >
                      <div className="menu-item-left">
                        <span className="menu-item-title" title={m.title}>{m.title}</span>
                        <div className="menu-item-meta">
                          <span className={`menu-item-interval interval-${m.interval}`}>
                            {m.interval === 'daily' ? 'Günlük' : m.interval === 'weekly' ? 'Haftalık' : 'Aylık'}
                          </span>
                          <span className={`status-icon-dot dot-${m.status}`}></span>
                        </div>
                      </div>
                      <div className="menu-item-right-panel">
                        <span className={`menu-item-progress progress-${m.status}`}>
                          {m.progress_text}
                        </span>
                        <span className={`status-badge-text text-${m.status}`}>
                          {m.status === 'completed' && '✓'}
                          {m.status === 'in_progress' && '⌛'}
                          {m.status === 'failed' && '✕'}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Main calendar grid column */}
            <div className="grid-column main-column">
              {selectedMission ? (
                <div className="panel-card">
                  <div className="mission-detail-header">
                    <div>
                      <h2 className="mission-detail-title">{selectedMission.title}</h2>
                      <p className="mission-detail-description">{selectedMission.description}</p>
                    </div>
                    
                    {/* Streaks (Zincirler) display */}
                    {selectedMission.interval !== 'monthly' && (
                      <div className="streaks-display">
                        <div className="streak-badge streak-current">
                          <span className="streak-val">{currentStreak} Gün</span>
                          <span className="streak-label">Mevcut Zincir</span>
                        </div>
                        <div className="streak-badge streak-max">
                          <span className="streak-val">{maxStreak} Gün</span>
                          <span className="streak-label">En Uzun Zincir</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Calendar controller */}
                  <div className="calendar-navigator" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem', margin: '0 auto 1.2rem auto' }}>
                    <button 
                      onClick={handlePrevMonth} 
                      style={{ background: 'none', border: 'none', color: 'var(--text-main)', cursor: 'pointer', fontSize: '1.2rem', padding: '0.2rem', outline: 'none', transition: 'opacity 0.2s' }}
                      onMouseEnter={e => e.currentTarget.style.opacity = '0.7'}
                      onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                    >
                      ◄
                    </button>
                    <span className="current-month-display" style={{ fontWeight: '600', fontSize: '1.05rem', margin: '0 0.2rem' }}>
                      {getMonthNameTurkish(currentDate.getMonth())} {currentDate.getFullYear()}
                    </span>
                    <button 
                      onClick={handleNextMonth} 
                      style={{ background: 'none', border: 'none', color: 'var(--text-main)', cursor: 'pointer', fontSize: '1.2rem', padding: '0.2rem', outline: 'none', transition: 'opacity 0.2s' }}
                      onMouseEnter={e => e.currentTarget.style.opacity = '0.7'}
                      onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                    >
                      ►
                    </button>
                  </div>

                  {/* Forecasted/Potential Penalty warning box */}
                  {!currentUser.isAdmin && (
                    <div className={`potential-penalty-banner ${forecastedUserPenalty > 0 ? 'has-penalty' : 'no-penalty'}`}>
                      <div className="penalty-banner-content">
                        <span className="banner-icon">{forecastedUserPenalty > 0 ? '⚠️' : '🛡️'}</span>
                        <span className="banner-text">
                          {forecastedUserPenalty > 0 ? (
                            <>Bu ayki olası ek cezanız: <strong>{forecastedUserPenalty} TL</strong>. Görevlerinizi tamamlayarak bu cezayı önleyebilirsiniz!</>
                          ) : (
                            <>Harika! Bu ay henüz ceza sınırına (5 başarısız görev) ulaşmadınız. Olası cezanız: <strong>0 TL</strong>.</>
                          )}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Calendar main contents: Chain grid for daily/weekly, Text form for monthly */}
                  {selectedMission.interval === 'monthly' ? (
                    <div className="monthly-input-wrapper">
                      <form onSubmit={handleSaveMonthly} className="panel-form">
                        <div className="form-group">
                          <label className="monthly-label-detail">{getMonthlyLabels(selectedMission.title).label}</label>
                          <textarea
                            rows="5"
                            placeholder={getMonthlyLabels(selectedMission.title).placeholder}
                            value={monthlyInputText}
                            onChange={e => setMonthlyInputText(e.target.value)}
                            disabled={selectedUserId !== currentUser.id}
                            className="monthly-textarea"
                          ></textarea>
                        </div>
                        
                        {selectedUserId === currentUser.id ? (
                          <button type="submit" className="btn btn-primary">
                            Kaydet
                          </button>
                        ) : (
                          <div className="read-only-badge">
                            Üyenin bu ayki cevabı yukarıda gösterilmektedir (Salt Okunur).
                          </div>
                        )}
                      </form>
                    </div>
                  ) : (
                    /* Don't Break The Chain Grid */
                    <div className="chain-calendar-wrapper">
                      <div className="calendar-weekday-header">
                        <span>Pzt</span>
                        <span>Sal</span>
                        <span>Çar</span>
                        <span>Per</span>
                        <span>Cum</span>
                        <span>Cmt</span>
                        <span>Paz</span>
                      </div>
                      
                      <div className="calendar-grid">
                        {renderCalendarCells()}
                      </div>
                    </div>
                  )}

                  {/* Extra reporting (Weekly sport metrics) */}
                  {selectedMission.interval === 'weekly' && (
                    <div className="mission-footer-reports">
                      <div className="weekly-sports-report">
                        <h3 className="section-subtitle">Haftalık Spor Takibi (Hedef: Haftada en az 2 gün)</h3>
                        <div className="weekly-report-grid">
                          {getWeeklyWorkoutsReport()}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="panel-card empty-state">
                  Lütfen sol menüden takip etmek istediğiniz görevi seçin.
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab: Leaderboard */}
        {activeTab === 'leaderboard' && (
          <div className="panel-card scrollable-panel">
            <h2 className="panel-title">Liderlik Tablosu</h2>

            <div className="leaderboards-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '2rem', marginTop: '1.5rem' }}>
              {/* Column 1: Bu Ayki Sıralama */}
              <div className="leaderboard-column">
                <div className="leaderboard-header-align" style={{ height: '98px', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', marginBottom: '2.5rem' }}>
                  <div className="calendar-navigator" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem', margin: '0 auto' }}>
                    <button 
                      onClick={() => {
                        const prevDate = new Date(leaderboardDate.getFullYear(), leaderboardDate.getMonth() - 1, 1);
                        if (prevDate.getFullYear() < 2026 || (prevDate.getFullYear() === 2026 && prevDate.getMonth() < 6)) {
                          showToast("Temmuz 2026'dan önceki aylara gidemezsiniz!", "info");
                          return;
                        }
                        setLeaderboardDate(prevDate);
                      }} 
                      style={{ background: 'none', border: 'none', color: 'var(--text-main)', cursor: 'pointer', fontSize: '1.2rem', padding: '0.2rem', outline: 'none', transition: 'opacity 0.2s' }}
                      onMouseEnter={e => e.currentTarget.style.opacity = '0.7'}
                      onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                    >
                      ◄
                    </button>
                    <span className="current-month-display" style={{ fontWeight: '600', fontSize: '1.05rem', margin: '0 0.2rem' }}>
                      {getMonthNameTurkish(leaderboardDate.getMonth())} {leaderboardDate.getFullYear()}
                    </span>
                    <button 
                      onClick={() => {
                        const nextDate = new Date(leaderboardDate.getFullYear(), leaderboardDate.getMonth() + 1, 1);
                        setLeaderboardDate(nextDate);
                      }} 
                      style={{ background: 'none', border: 'none', color: 'var(--text-main)', cursor: 'pointer', fontSize: '1.2rem', padding: '0.2rem', outline: 'none', transition: 'opacity 0.2s' }}
                      onMouseEnter={e => e.currentTarget.style.opacity = '0.7'}
                      onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                    >
                      ►
                    </button>
                  </div>
                </div>

                <div className="leaderboard-list">
                  {leaderboardPenalties
                    .map(item => ({
                      ...item,
                      completedMissionsCount: item.completedMissionsCount || 0
                    }))
                    .sort((a, b) => b.completedMissionsCount - a.completedMissionsCount || a.username.localeCompare(b.username))
                    .map((item, index) => {
                      const isCurrentUserObj = item.username === currentUser.username;
                      const rankBadge = `${index + 1}.`;

                      return (
                        <div 
                          key={item.username} 
                          className={`leaderboard-item ${isCurrentUserObj ? 'current-user-item' : ''}`}
                        >
                          <div className="leaderboard-item-left">
                            <span className="leaderboard-rank">{rankBadge}</span>
                            <span className="leaderboard-username" title={item.username}>
                              {item.username} {isCurrentUserObj && '(Siz)'}
                            </span>
                          </div>
                          <span className="leaderboard-score">
                            {item.completedMissionsCount} / 10 Görev
                          </span>
                        </div>
                      );
                    })}
                  {leaderboardPenalties.length === 0 && (
                    <div className="leaderboard-empty">Henüz üye bulunmuyor.</div>
                  )}
                </div>
              </div>

              {/* Column 2: Tüm Zamanların Sıralaması */}
              <div className="leaderboard-column">
                <div className="leaderboard-header-align" style={{ height: '98px', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', marginBottom: '2.5rem' }}>
                  <h3 className="section-subtitle" style={{ margin: '0 0 1rem 0' }}>Tüm Zamanların Sıralaması</h3>
                </div>

                <div className="leaderboard-list">
                  {leaderboardPenalties
                    .map(item => ({
                      ...item,
                      allTimeCompletedMissionsCount: item.allTimeCompletedMissionsCount || 0
                    }))
                    .sort((a, b) => b.allTimeCompletedMissionsCount - a.allTimeCompletedMissionsCount || a.username.localeCompare(b.username))
                    .map((item, index) => {
                      const isCurrentUserObj = item.username === currentUser.username;
                      const rankBadge = `${index + 1}.`;

                      return (
                        <div 
                          key={item.username} 
                          className={`leaderboard-item ${isCurrentUserObj ? 'current-user-item' : ''}`}
                        >
                          <div className="leaderboard-item-left">
                            <span className="leaderboard-rank">{rankBadge}</span>
                            <span className="leaderboard-username" title={item.username}>
                              {item.username} {isCurrentUserObj && '(Siz)'}
                            </span>
                          </div>
                          <span className="leaderboard-score">
                            {item.allTimeCompletedMissionsCount} Başarılı Görev
                          </span>
                        </div>
                      );
                    })}
                  {leaderboardPenalties.length === 0 && (
                    <div className="leaderboard-empty">Henüz üye bulunmuyor.</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab: Pay Penalty */}
        {activeTab === 'pay-penalty' && (
          <div className="panel-card scrollable-panel" style={{ maxWidth: '500px', margin: '0 auto' }}>
            <h2 className="panel-title">Ceza Ödeme Paneli</h2>
            
            {currentUser.isAdmin ? (
              <div className="info-banner" style={{ backgroundColor: 'var(--completed-bg)', borderColor: 'var(--completed-border)', padding: '1rem', borderRadius: '8px', color: 'var(--completed-color)', fontWeight: '600' }}>
                🛡️ Yönetici Muafiyeti: Yönetici hesapları cezalardan muaftır. Herhangi bir ceza borcunuz bulunmamaktadır.
              </div>
            ) : (
              <div>
                <div className="penalty-summary-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                  <div style={{ backgroundColor: 'var(--bg-input)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-color)', textAlign: 'center' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: '600', textTransform: 'uppercase' }}>TOPLAM BİRİKMİŞ CEZA</div>
                    <div style={{ fontSize: '1.4rem', fontWeight: '800', color: 'var(--text-main)', marginTop: '0.25rem' }}>
                      {(userCumulativePenalty + userTotalPaidPenalty).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL
                    </div>
                  </div>
                  <div style={{ backgroundColor: 'var(--bg-input)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-color)', textAlign: 'center' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: '600', textTransform: 'uppercase' }}>ÖDENEN MİKTAR</div>
                    <div style={{ fontSize: '1.4rem', fontWeight: '800', color: 'var(--primary)', marginTop: '0.25rem' }}>
                      {userTotalPaidPenalty.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL
                    </div>
                  </div>
                </div>

                <div style={{ backgroundColor: 'var(--danger-glow)', padding: '1.25rem', borderRadius: '8px', border: '1px solid rgba(220, 38, 38, 0.15)', textAlign: 'center', marginBottom: '2rem' }}>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: '600', textTransform: 'uppercase' }}>KALAN CEZA BORCUNUZ</div>
                  <div style={{ fontSize: '2rem', fontWeight: '800', color: 'var(--danger)', marginTop: '0.5rem' }}>
                    {userCumulativePenalty.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL
                  </div>
                </div>

                {userCumulativePenalty > 0 ? (
                  <form onSubmit={handlePayPenalty} className="panel-form">
                    <div className="form-group">
                      <label htmlFor="payment-amount">Ödenecek Miktar (TL)</label>
                      <input
                        id="payment-amount"
                        type="number"
                        step="0.01"
                        min="0.01"
                        max={userCumulativePenalty}
                        placeholder="Ödemek istediğiniz tutarı girin"
                        value={paymentAmountInput}
                        onChange={e => setPaymentAmountInput(e.target.value)}
                        required
                      />
                    </div>
                    <button type="submit" className="btn btn-primary btn-block">
                      Ödemeyi Tamamla
                    </button>
                  </form>
                ) : (
                  <div className="info-banner" style={{ backgroundColor: 'var(--completed-bg)', borderColor: 'var(--completed-border)', padding: '1rem', borderRadius: '8px', textAlign: 'center', color: 'var(--primary)', fontWeight: '600' }}>
                    🎉 Tebrikler! Ödenmemiş herhangi bir ceza borcunuz bulunmamaktadır.
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Roster / Member Directory (Admin Only) */}
        {activeTab === 'members' && currentUser.isAdmin && (
          <div className="dashboard-grid">
            {/* Add User form */}
            <div className="grid-column sidebar-column">
              <div className="panel-card">
                <h2 className="panel-title">Yeni Üye Kaydı</h2>
                <form onSubmit={handleAddUser} className="panel-form">
                  <div className="form-group">
                    <label>Kullanıcı Adı</label>
                    <input
                      type="text"
                      placeholder="e.g. ahmet123"
                      value={newUsername}
                      onChange={e => setNewUsername(e.target.value)}
                    />
                  </div>
                  
                  <div className="form-group">
                    <label>Geçici Şifre</label>
                    <input
                      type="password"
                      placeholder="Şifre belirleyin"
                      value={newUserPassword}
                      onChange={e => setNewUserPassword(e.target.value)}
                    />
                  </div>

                  <div className="form-group-checkbox">
                    <input
                      type="checkbox"
                      id="new-user-admin"
                      checked={newUserIsAdmin}
                      onChange={e => setNewUserIsAdmin(e.target.checked)}
                    />
                    <label htmlFor="new-user-admin">Yönetici Yetkisi Ver</label>
                  </div>

                  <button type="submit" className="btn btn-primary btn-block">
                    Üyeyi Kaydet
                  </button>
                </form>
              </div>
            </div>

            {/* Roster list */}
            <div className="grid-column main-column">
              <div className="panel-card scrollable-panel">
                <h2 className="panel-title">Aktif Üye Rosterı ({users.length})</h2>
                <div className="roster-list">
                  {users.map(u => (
                    <div key={u.id} className="roster-card">
                      <div className="roster-info">
                        <span className="roster-name">{u.username}</span>
                        <span className={`roster-role ${u.is_admin ? 'role-admin' : 'role-member'}`}>
                          {u.is_admin ? 'Clearance: Yönetici (Admin)' : 'Clearance: Standart Üye'}
                        </span>
                      </div>
                      <div className="roster-actions">
                        {currentUser.id !== u.id ? (
                          <button 
                            onClick={() => handleDeleteUser(u.id)}
                            className="btn btn-outline-danger btn-sm"
                          >
                            Üyeliği Sil
                          </button>
                        ) : (
                          <span className="current-user-tag">Kendiniz</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Vizyon Account adjustments (Admin Only) */}
        {activeTab === 'account' && currentUser.isAdmin && (
          <div className="dashboard-grid">
            {/* Account adjusting card */}
            <div className="grid-column sidebar-column">
              <div className="panel-card">
                <h2 className="panel-title">Vizyon Hesabı Bakiye Güncelle</h2>
                <form onSubmit={handleAdjustAccount} className="panel-form">
                  
                  <div className="form-group">
                    <label>İşlem Tipi</label>
                    <select value={adjustType} onChange={e => setAdjustType(e.target.value)}>
                      <option value="add">Para Ekle (TL +)</option>
                      <option value="subtract">Para Çıkar (TL -)</option>
                      <option value="set">Bakiye Eşitle (TL =)</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Miktar (TL)</label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="e.g. 200.00"
                      value={adjustAmount}
                      onChange={e => setAdjustAmount(e.target.value)}
                    />
                  </div>

                  <button type="submit" className="btn btn-primary btn-block">
                    Kasayı Güncelle
                  </button>
                </form>
              </div>
            </div>

            {/* Penalty leaderboard details */}
            <div className="grid-column main-column">
              <div className="panel-card scrollable-panel">
                <h2 className="panel-title">Detaylı Ceza Durum Tablosu (Toplam Birikmiş)</h2>
                <table className="penalty-table">
                  <thead>
                    <tr>
                      <th>Kullanıcı Adı</th>
                      <th>Birikmiş Toplam Ceza</th>
                      <th>Bu Ayki Olası Ek Ceza</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailedPenalties.map((item, idx) => (
                      <tr key={idx} className={item.username === currentUser.username ? 'highlight-row' : ''}>
                        <td>{item.username} {item.username === currentUser.username ? '(Siz)' : ''}</td>
                        <td className="text-danger font-bold">{item.cumulativePenalty} TL</td>
                        <td className="text-warning font-bold">+{item.forecastedPenalty} TL</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

      </main>

      {/* Floating Notification Toast */}
      {toast.show && (
        <div className={`toast-notification toast-${toast.type}`}>
          <div className="toast-content">
            <span className="toast-icon">
              {toast.type === 'success' && '✓'}
              {toast.type === 'error' && '✕'}
              {toast.type === 'info' && 'i'}
            </span>
            <span className="toast-message">{toast.message}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
