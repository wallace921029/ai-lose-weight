// 运动库：MET 值。消耗 kcal = MET * 3.5 * 体重kg / 200 * 分钟
export const EXERCISES = [
  { name: '散步(慢)', met: 2.5 },
  { name: '快走', met: 4.3 },
  { name: '慢跑(8km/h)', met: 8.3 },
  { name: '跑步(10km/h)', met: 9.8 },
  { name: '跑步(12km/h)', met: 11.2 },
  { name: '跳绳', met: 11.0 },
  { name: '骑行(通勤速度)', met: 6.8 },
  { name: '骑行(快)', met: 10.0 },
  { name: '游泳(自由泳)', met: 8.3 },
  { name: '游泳(蛙泳)', met: 5.3 },
  { name: '力量训练(器械)', met: 5.0 },
  { name: '力量训练(自由重量)', met: 6.0 },
  { name: 'HIIT', met: 8.0 },
  { name: '瑜伽', met: 3.0 },
  { name: '普拉提', met: 3.8 },
  { name: '爬楼梯', met: 8.8 },
  { name: '椭圆机', met: 5.0 },
  { name: '划船机', met: 7.0 },
  { name: '健身操', met: 5.0 },
  { name: '跳操(帕梅拉)', met: 6.5 },
  { name: '羽毛球', met: 5.5 },
  { name: '乒乓球', met: 4.5 },
  { name: '网球', met: 7.3 },
  { name: '篮球', met: 6.5 },
  { name: '足球', met: 7.0 },
  { name: '爬山', met: 6.0 },
  { name: '跳舞', met: 4.5 },
  { name: '家务打扫', met: 2.5 },
  { name: '遛狗', met: 3.0 },
];

export function exerciseKcal(met, weightKg, minutes) {
  return Math.round((met * 3.5 * weightKg) / 200 * minutes);
}
