import { useEffect, useState } from 'react';
import { api, formatTime } from '../api.js';

export default function Dashboard() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    api('/admin/stats').then(setStats).catch(() => {});
  }, []);

  if (!stats) return <div className="spin" />;

  const maxVisitors = Math.max(1, ...stats.week.map((w) => w.visitors));
  const totalGames = stats.totals.games;
  const maxScore = Math.max(1, ...stats.top_games.map((g) => g.score));
  const maxHourly = Math.max(1, ...stats.hourly.map((h) => h.visits));
  const maxRegion = Math.max(1, ...stats.regions.map((r) => r.visitors));
  const hourlyMap = Array.from({ length: 24 }, (_, i) => stats.hourly.find((h) => h.hour === i)?.visits || 0);

  return (
    <div>
      <div className="main-header">
        <h1>📊 仪表盘</h1>
        <span className="muted small">数据实时统计</span>
      </div>

      <div className="stat-grid mb16">
        <div className="stat-card">
          <div className="stat-label">今日访问人数（独立 IP）</div>
          <div className="stat-value blue">{stats.today_visitors}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">今日页面访问量（PV）</div>
          <div className="stat-value">{stats.today_visits}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">昨日访问人数</div>
          <div className="stat-value">{stats.yesterday_visitors}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">实时在线（15 分钟）</div>
          <div className="stat-value green">{stats.online_now}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">今日注册</div>
          <div className="stat-value green">{stats.today_registrations}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">今日评论</div>
          <div className="stat-value">{stats.today_comments}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">待审核举报</div>
          <div className="stat-value red">{stats.pending_reports}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">待审核存档</div>
          <div className="stat-value yellow">{stats.pending_saves}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">游戏总数</div>
          <div className="stat-value">{totalGames}</div>
        </div>
      </div>

      <div className="card">
        <h3>近 7 天访问人数</h3>
        <div className="bar-chart">
          {stats.week.map((w) => (
            <div key={w.date} className="bar-col">
              <span className="small muted">{w.visitors}</span>
              <div className="bar" style={{ height: `${(w.visitors / maxVisitors) * 90}%` }} />
              <span className="bar-label">{w.date}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h3>今日分时访问量（24 小时）</h3>
        <div className="bar-chart" style={{ height: 100 }}>
          {hourlyMap.map((v, h) => (
            <div key={h} className="bar-col" title={`${h}:00 - ${v} 次`}>
              <span className="small muted" style={{ fontSize: 10 }}>{v > 0 ? v : ''}</span>
              <div className="bar" style={{ height: `${(v / maxHourly) * 80}%`, background: v > 0 ? 'linear-gradient(180deg,#38bdf8,#0284c7)' : 'transparent' }} />
              <span className="bar-label" style={{ fontSize: 10 }}>{h}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h3>🌍 今日访客地区分布（独立 IP）</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>地区</th><th>访客数</th><th>占比</th></tr>
            </thead>
            <tbody>
              {stats.regions.map((r) => (
                <tr key={r.country}>
                  <td style={{ fontWeight: 600 }}>{r.country}</td>
                  <td>{r.visitors}</td>
                  <td style={{ width: 200 }}>
                    <div style={{ height: 7, background: '#e2e8f0', borderRadius: 99, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${(r.visitors / maxRegion) * 100}%`, background: '#22c55e', borderRadius: 99 }} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="small muted mt8">地区信息由 ip-api.com 异步补充，境外/失败记录显示为"未知"</p>
      </div>

      <div className="card">
        <h3>🔍 热门搜索词（近 7 天）</h3>
        {stats.hot_searches.length === 0 ? <p className="muted small">暂无搜索数据</p> : (
          <div className="flex" style={{ flexWrap: 'wrap', gap: 10 }}>
            {stats.hot_searches.map((s, i) => (
              <span key={s.keyword} className="badge" style={{ background: '#ede9fe', color: '#6d28d9', fontSize: 13, padding: '6px 12px' }}>
                {i + 1}. {s.keyword} <span className="muted">×{s.cnt}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <h3>🔗 来源 Top（近 7 天）</h3>
        {stats.referers.length === 0 ? <p className="muted small">暂无数据</p> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>来源</th><th>次数</th></tr></thead>
              <tbody>
                {stats.referers.map((r) => (
                  <tr key={r.ref}>
                    <td className="cell-clamp" style={{ maxWidth: 420 }}>{r.ref}</td>
                    <td>{r.cnt}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <h3>🔥 热度 TOP 10 游戏</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th><th>游戏</th><th>游玩</th><th>点赞</th><th>收藏</th><th>评论</th><th>热度分</th><th>占比</th>
              </tr>
            </thead>
            <tbody>
              {stats.top_games.map((g, i) => (
                <tr key={g.id}>
                  <td><strong>{i + 1}</strong></td>
                  <td className="cell-clamp" style={{ fontWeight: 600 }}>{g.title}</td>
                  <td>{g.play_count}</td>
                  <td>{g.likes_count}</td>
                  <td>{g.favorites_count}</td>
                  <td>{g.comments_count}</td>
                  <td><strong style={{ color: '#4f46e5' }}>{g.score}</strong></td>
                  <td style={{ width: 160 }}>
                    <div className="progress-bar" style={{ height: 7, background: '#e2e8f0', borderRadius: 99, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${(g.score / maxScore) * 100}%`, background: '#4f46e5', borderRadius: 99 }} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h3>📦 数据总览</h3>
        <div className="flex" style={{ gap: 30, flexWrap: 'wrap' }}>
          {[
            ['用户', stats.totals.users],
            ['游戏', stats.totals.games],
            ['评论', stats.totals.comments],
            ['存档', stats.totals.saves],
            ['公告', stats.totals.announcements],
          ].map(([label, v]) => (
            <div key={label} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 800 }}>{v}</div>
              <div className="small muted">{label}</div>
            </div>
          ))}
          <div className="small muted" style={{ alignSelf: 'center' }}>
            最后更新：{formatTime(new Date().toISOString())}
          </div>
        </div>
      </div>
    </div>
  );
}
