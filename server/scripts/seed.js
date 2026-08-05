/**
 * seed 脚本：创建管理员账号（Winster / winster）与示例游戏。
 * 用法：npm run seed
 * 管理员初始密码来自 ADMIN_PASSWORD 环境变量；未设置时使用默认密码并打印提示。
 */
import { query } from '../src/db.js';
import { hashPassword } from '../src/auth.js';
import { config } from '../src/config.js';
import { migrate } from '../src/migrate.js';

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Winster@2025';

async function seed() {
  await migrate();

  for (const username of config.adminUsernames) {
    const existing = await query('SELECT id FROM users WHERE lower(username) = lower($1)', [username]);
    if (existing.length) {
      await query('UPDATE users SET role = $1 WHERE id = $2', ['admin', existing[0].id]);
      console.log(`[seed] ${username} 已存在，已确保其为管理员`);
    } else {
      const email = `${username.toLowerCase()}@example.com`;
      const passwordHash = await hashPassword(ADMIN_PASSWORD);
      await query(
        'INSERT INTO users (username, email, password_hash, role, email_verified) VALUES ($1,$2,$3,$4,TRUE)',
        [username, email, passwordHash, 'admin']
      );
      console.log(`[seed] 已创建管理员 ${username}（邮箱 ${email}）`);
    }
  }

  // 示例游戏（仅当游戏表为空时）
  const gameCount = await query('SELECT COUNT(*)::int AS c FROM games');
  if (gameCount[0].c === 0) {
    const samples = [
      {
        title: '星露谷物语 汉化版',
        description: '一款开放的乡村生活模拟经营游戏。你继承了爷爷的农场，在鹈鹕镇开始新的生活：种植作物、饲养动物、采矿、钓鱼、与镇民互动……汉化组精心翻译，全文本中文化。',
        tags: ['模拟经营', '休闲', '像素风'],
        coverUrl: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=600',
        originalUrl: 'https://www.stardewvalley.net/',
        localizedUrl: 'https://www.stardewvalley.net/',
      },
      {
        title: '空洞骑士 汉化版',
        description: '在庞大的地下王国中探索。经典类银河恶魔城游戏，挑战强大的 Boss，揭开圣巢的秘密。汉化补丁已整合，安装即玩。',
        tags: ['动作', '冒险', '类银河恶魔城'],
        coverUrl: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=600',
        originalUrl: 'https://www.hollowknight.com/',
        localizedUrl: 'https://www.hollowknight.com/',
      },
      {
        title: '泰拉瑞亚 汉化版',
        description: '挖掘、战斗、探索、建造！在这个动感十足的冒险游戏中，你可以做任何事。完整的汉化文本，支持联机。',
        tags: ['沙盒', '冒险', '建造'],
        coverUrl: 'https://images.unsplash.com/photo-1614294148960-9aa740632a87?w=600',
        originalUrl: 'https://terraria.org/',
        localizedUrl: 'https://terraria.org/',
      },
    ];
    for (const g of samples) {
      await query(
        `INSERT INTO games (title, description, tags, cover_type, cover_url, original_url, localized_url)
         VALUES ($1,$2,$3,'url',$4,$5,$6)`,
        [g.title, g.description, g.tags, g.coverUrl, g.originalUrl, g.localizedUrl]
      );
    }
    console.log('[seed] 已插入 3 个示例游戏');
  }

  console.log('[seed] 完成');
  console.log(`[seed] ⚠️  管理员默认密码: ${ADMIN_PASSWORD} —— 请立即登录后台修改，或部署时设置 ADMIN_PASSWORD 环境变量`);
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[seed] 失败:', err);
    process.exit(1);
  });
