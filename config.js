// ===== 설정 =====
// Supabase 프로젝트 > Settings > API 에서 복사해 넣으세요.
// 값이 비어 있으면 브라우저 안에서만 동작하는 "데모 모드"로 실행돼요.
window.CHALKAK_CONFIG = {
  SUPABASE_URL: "",       // 예: "https://abcdxyz.supabase.co"
  SUPABASE_ANON_KEY: "",  // 예: "eyJhbGciOi..."
  EVENT_SLUG: "our-wedding", // 앨범 주소 (supabase-setup.sql 맨 아래 값과 같게)
  BUCKET: "wedding-photos",
  MAX_VIDEO_MB: 50,       // Supabase 무료 플랜 업로드 한도
  IMAGE_MAX_EDGE: 2560    // 업로드 전 사진 긴 변을 이 크기로 줄여요 (용량 절약)
};
