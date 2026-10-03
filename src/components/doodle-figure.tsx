/**
 * 手绘小人：体型随 BMI 连续变化（18~30 映射到 0~1，日常区间走满全程），分男女造型。
 * 全部用墨线描边 + 粉彩填色，与全局手绘卡通风一致。
 */
export function DoodleFigure({
  bmi,
  gender,
  size = 88,
  className,
}: {
  bmi: number;
  gender: 'male' | 'female';
  size?: number;
  className?: string;
}) {
  const t = Math.min(1, Math.max(0, (bmi - 18) / 12)); // 0 = 纤瘦，1 = 圆润
  const rx = 10 + t * 18; // 身体半宽 10~28，跨度放大让变化一眼可见
  const ry = 14 + t * 10; // 身体半高 14~24
  const cy = 92; // 身体中心
  const topY = cy - ry;
  const bottomY = cy + ry;
  const legX = 6 + t * 7; // 站距随体型明显变宽
  const armX = rx + 2 + t * 6; // 手臂张开幅度
  const faceR = 17.5 + t * 3; // 脸也随 BMI 微微变圆
  const female = gender === 'female';
  const ink = '#43352a';
  const skin = '#ffe3c9';
  const hair = female ? '#42302a' : '#6b4f3a';
  const cloth = female ? '#f9b8cd' : '#9ed3f3';

  const armL = `M ${60 - rx + 2} ${topY + 8} Q ${60 - armX - 4} ${cy} ${60 - armX} ${bottomY - 5}`;
  const armR = `M ${60 + rx - 2} ${topY + 8} Q ${60 + armX + 4} ${cy} ${60 + armX} ${bottomY - 5}`;

  return (
    <svg
      width={size}
      height={(size * 160) / 120}
      viewBox="0 0 120 160"
      className={className}
      aria-label={`${female ? '女' : '男'}孩形象，BMI ${bmi.toFixed(1)}`}
    >
      {/* 地面虚线影子 */}
      <ellipse cx="60" cy="150" rx={rx + 12} ry="4" fill="none" stroke={ink} strokeWidth="2" strokeDasharray="5 5" opacity="0.4" />

      {/* 腿和脚 */}
      <g stroke={ink} strokeWidth="4.5" strokeLinecap="round">
        <path d={`M ${60 - legX} ${bottomY - 3} L ${60 - legX - 1} 141`} />
        <path d={`M ${60 + legX} ${bottomY - 3} L ${60 + legX + 1} 141`} />
        {/* 脚 */}
        <path d={`M ${60 - legX - 1} 141 L ${60 - legX - 7} 141`} strokeWidth="4" />
        <path d={`M ${60 + legX + 1} 141 L ${60 + legX + 7} 141`} strokeWidth="4" />
      </g>

      {/* 身体：男=圆身+短裤，女=连衣裙 */}
      {female ? (
        <path
          d={`M 60 ${topY - 2}
              C ${60 - rx * 0.45} ${topY + 10}, ${60 - rx * 0.8} ${bottomY - 8}, ${60 - rx - 2} ${bottomY + 3}
              L ${60 + rx + 2} ${bottomY + 3}
              C ${60 + rx * 0.8} ${bottomY - 8}, ${60 + rx * 0.45} ${topY + 10}, 60 ${topY - 2} Z`}
          fill={cloth}
          stroke={ink}
          strokeWidth="3"
          strokeLinejoin="round"
        />
      ) : (
        <>
          <ellipse cx="60" cy={cy} rx={rx} ry={ry} fill={cloth} stroke={ink} strokeWidth="3" />
          <rect
            x={60 - rx * 0.72}
            y={bottomY - 13}
            width={rx * 1.44}
            height="14"
            rx="5"
            fill="#ffd97a"
            stroke={ink}
            strokeWidth="2.5"
          />
        </>
      )}

      {/* 肚子褶：体型偏圆润时加一道手绘弧线 */}
      {t > 0.45 && (
        <path
          d={`M ${60 - rx * 0.4} ${cy + 2} Q 60 ${cy + 7} ${60 + rx * 0.4} ${cy + 2}`}
          fill="none"
          stroke={ink}
          strokeWidth="2.2"
          strokeLinecap="round"
          opacity="0.7"
        />
      )}

      {/* 手臂：墨线包边的肤色线条 */}
      <g strokeLinecap="round" fill="none">
        <path d={armL} stroke={ink} strokeWidth="7.5" />
        <path d={armR} stroke={ink} strokeWidth="7.5" />
        <path d={armL} stroke={skin} strokeWidth="3.5" />
        <path d={armR} stroke={skin} strokeWidth="3.5" />
      </g>

      {/* 脖子 */}
      <path d={`M 60 62 L 60 ${topY + 4}`} stroke={ink} strokeWidth="3.5" strokeLinecap="round" />

      {/* 头：后发 → 脸 → 五官 */}
      {female && (
        <>
          <circle cx="35" cy="46" r="7.5" fill={hair} stroke={ink} strokeWidth="2.5" />
          <circle cx="85" cy="46" r="7.5" fill={hair} stroke={ink} strokeWidth="2.5" />
        </>
      )}
      <circle cx="60" cy="39" r="21.5" fill={hair} stroke={ink} strokeWidth="3" />
      {!female && (
        /* 男孩子的三根呆毛 */
        <g stroke={ink} strokeWidth="2.5" strokeLinecap="round">
          <path d="M 50 21 L 46 13" />
          <path d="M 60 18 L 60 10" />
          <path d="M 70 21 L 74 13" />
        </g>
      )}
      <circle cx="60" cy="47" r={faceR} fill={skin} stroke={ink} strokeWidth="3" />

      {/* 双下巴：圆润体型专属 */}
      {t > 0.6 && (
        <path
          d={`M ${60 - faceR * 0.55} ${47 + faceR * 0.72} Q 60 ${47 + faceR * 1.05} ${60 + faceR * 0.55} ${47 + faceR * 0.72}`}
          fill="none"
          stroke={ink}
          strokeWidth="2.2"
          strokeLinecap="round"
          opacity="0.6"
        />
      )}

      {/* 表情 */}
      <circle cx="53" cy="48" r="2.3" fill={ink} />
      <circle cx="67" cy="48" r="2.3" fill={ink} />
      <path d="M 54 55 Q 60 60 66 55" fill="none" stroke={ink} strokeWidth="2.5" strokeLinecap="round" />
      {female && (
        <>
          <circle cx="45" cy="54" r="3.2" fill="#ff9d87" opacity="0.55" />
          <circle cx="75" cy="54" r="3.2" fill="#ff9d87" opacity="0.55" />
        </>
      )}
    </svg>
  );
}

/** BMI 分类（中国成人标准） */
export function bmiCategory(bmi: number): { label: string; pill: string } {
  if (bmi < 18.5) return { label: '偏瘦', pill: 'bg-sky/20 text-[#20628f] border-sky' };
  if (bmi < 24) return { label: '正常', pill: 'bg-good/20 text-good-deep border-good' };
  if (bmi < 28) return { label: '偏胖', pill: 'bg-warn/20 text-[#b26a00] border-warn' };
  return { label: '肥胖', pill: 'bg-brand/15 text-brand-deep border-brand' };
}
