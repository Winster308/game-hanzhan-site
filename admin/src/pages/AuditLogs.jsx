import { useCallback, useEffect, useState } from 'react';
import { api, formatTime } from '../api.js';
import Pagination from '../components/Pagination.jsx';

const ACTION_LABEL = {
  'game.create': ['添加游戏', 'badge-green'],
  'game.update': ['修改游戏', 'badge-blue'],
  'game.delete': ['删除游戏', 'badge-red'],
  'comment.update': ['修改评论', 'badge-blue'],
  'comment.delete': ['删除评论', 'badge-red'],
  'user.ban': ['封禁用户', 'badge-red'],
  'user.unban': ['解封用户', 'badge-green'],
  'user.role': ['调整角色', 'badge-purple'],
  'report.approve': ['确认举报', 'badge-yellow'],
  'save.approve': ['通过存档', 'badge-green'],
  'save.reject': ['驳回存档', 'badge-yellow'],
  'appeal.approve': ['通过申诉', 'badge-green'],
  'appeal.reject': ['驳回申诉', 'badge-red'],
  'submission.approve': ['通过投稿', 'badge-green'],
  'submission.reject': ['驳回投稿', 'badge-yellow'],
  'announcement.create': ['发布公告', 'badge-green'],
  'announcement.update': ['修改公告', 'badge-blue'],
  'announcement.delete': ['删除公告', 'badge-red'],
};

export default function AuditLogs() {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  const load = useCallback(() => {
    api(`/admin/audit-logs?page=${page}&pageSize=20`)
      .then((d) => { setLogs(d.logs); setTotal(d.total); })
      .catch(() => {});
  }, [page]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div className="main-header">
        <h1>📜 审计日志</h1>
        <span className="muted small">管理员操作全程留痕</span>
      </div>

      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>ID</th><th>时间</th><th>管理员</th><th>操作</th><th>对象</th><th>详情</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => {
              const [label, cls] = ACTION_LABEL[l.action] || [l.action, 'badge-gray'];
              let detail = '';
              try { detail = l.detail ? JSON.stringify(JSON.parse(l.detail)) : ''; } catch { detail = l.detail || ''; }
              return (
                <tr key={l.id}>
                  <td>{l.id}</td>
                  <td>{formatTime(l.created_at)}</td>
                  <td style={{ fontWeight: 600 }}>{l.admin_name || '系统'}</td>
                  <td><span className={`badge ${cls}`}>{label}</span></td>
                  <td>{l.target_type ? `${l.target_type}#${l.target_id}` : '-'}</td>
                  <td className="cell-clamp" style={{ maxWidth: 380 }}>{detail || '-'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {logs.length === 0 && <div className="empty">暂无日志</div>}
      </div>
      <Pagination page={page} total={total} pageSize={20} onChange={setPage} />
    </div>
  );
}
