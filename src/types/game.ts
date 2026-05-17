// src/types/game.ts
export type GameType =
  | 'เกมทายภาพปริศนา'
  | 'เกมปาร์ตี้'
  | 'เกมทายเบอร์เงิน'
  | 'เกมทายผลบอล'
  | 'เกมบอลโลก'
  | 'เกมสล็อต'
  | 'เกมเช็คอิน'
  | 'เกมประกาศรางวัล'
  | 'เกมลุ้นรางวัลพิเศษ'
  | 'เกมลอยกระทง'
  | 'เกมแนะนำเพื่อน'
  | 'เกมป๊อกเด้ง';

export type GameData = {
  id: string;
  type: GameType;
  name: string;
  unlocked?: boolean;
  locked?: boolean;
  userAccessType?: 'all' | 'selected';
  selectedUsers?: string[];
  codes?: string[];
  codeCursor?: number;
  claimedBy?: Record<string, any>;
  puzzle?: { imageDataUrl?: string; answer?: string };
  partyRounds?: Array<{
    round: number;
    answer?: string;
    codeCount?: number;
    codeStartIndex?: number;
    codeEndIndex?: number;
    imageDataUrl?: string;
    fileName?: string;
  }>;
  numberPick?: {
    imageDataUrl?: string;
    endAt?: number | null;
    /** คำตอบที่ถูก (กรอกตอนสิ้นสุดกิจกรรม) */
    correctAnswer?: string;
    /** กิจกรรมจบแล้วหรือยัง */
    ended?: boolean;
    /** เวลา (epoch ms) ที่กดสิ้นสุดกิจกรรม */
    endedAt?: number | null;
    /** รูปประกาศผู้ชนะ (ส่งเข้า Telegram) — เก็บต่อเกม */
    winnersTelegramImageUrl?: string;
    /** Snapshot ไฟล์รายงานฝาก (ตรวจยอดฝากของผู้ทายถูก) — เก็บต่อเกม */
    depositReport?: {
      fileName?: string;
      uploadedAt?: number;
      totalRows?: number;
      /** map: normalized username → ยอดรวมเฉพาะ Finance Type ที่กำหนด */
      sumByUser?: Record<string, number>;
    };
  };
  football?: {
    imageDataUrl?: string;
    homeTeam?: string;
    awayTeam?: string;
    endAt?: number | null;
    /** คำตอบที่ถูก ในรูปแบบ "X-Y" (สกอร์ทีมเหย้า-ทีมเยือน) */
    correctAnswer?: string;
    /** กิจกรรมจบแล้วหรือยัง */
    ended?: boolean;
    /** เวลา (epoch ms) ที่กดสิ้นสุดกิจกรรม */
    endedAt?: number | null;
    /** รูปประกาศผู้ชนะ (ส่งเข้า Telegram) — เก็บต่อเกม */
    winnersTelegramImageUrl?: string;
    /** Snapshot ไฟล์รายงานฝาก (ตรวจยอดฝากของผู้ทายถูก) — เก็บต่อเกม */
    depositReport?: {
      fileName?: string;
      uploadedAt?: number;
      totalRows?: number;
      /** map: normalized username → ยอดรวมเฉพาะ Finance Type ที่กำหนด */
      sumByUser?: Record<string, number>;
    };
  };
  worldCup?: {
    /** ชื่อแสดง (เช่น "FIFA World Cup 2026") */
    title?: string;
    /** กิจกรรมทั้งหมดถูกปิดโดยแอดมินหรือยัง (กันการทายเพิ่มทั้งระบบ) */
    ended?: boolean;
    /** เวลา (epoch ms) ที่แอดมินกดสิ้นสุดกิจกรรมทั้งระบบ */
    endedAt?: number | null;
    /**
     * โบนัสสะสมต่อคู่ที่ทายถูก — บันทึกอัตโนมัติให้ผู้ทายล่าสุดถูก
     * ตอนแอดมินกด "สิ้นสุดกิจกรรมคู่นี้" (default 50)
     * โบนัสนี้แสดงในหน้าเกมเท่านั้น ไม่ผูกกับระบบเหรียญใดๆ
     */
    bonusPerCorrect?: number;
    /**
     * ผลแข่ง / โค้ดรางวัล / และ claim รายคู่ — key = matchId (1..104)
     * claimedBy[userId]:
     *  - code: โค้ดที่ได้รับ (อาจว่างถ้าโค้ดหมด)
     *  - bonus: โบนัสสะสมที่ได้รับ (แต้ม)
     *  - ts: เวลาแจก
     *  - answer: คำทาย (สำหรับ trace)
     */
    matchResults?: Record<
      string,
      {
        home?: number;
        away?: number;
        codes?: string[];
        codeCursor?: number;
        codeFileName?: string;
        claimedBy?: Record<
          string,
          { code?: string; bonus?: number; ts: number; answer?: string }
        >;
        ended?: boolean;
        endedAt?: number | null;
      }
    >;
  };
  slot?: any;
  announce?: { 
    users?: string[]; 
    userBonuses?: Array<{ user: string; bonus: number }>; 
    imageDataUrl?: string; // รูปภาพประกาศรางวัล (CDN URL หรือ Supabase Storage URL)
    fileName?: string; // ชื่อไฟล์รูปภาพ
  };
  trickOrTreat?: {
    winChance?: number; // โอกาสชนะ (0-100)
    ghostImage?: string; // รูปผีที่เด้งขึ้นมา
  };
  loyKrathong?: {
    image?: string; // รูปภาพพื้นหลัง
    endAt?: number | null; // เวลาจบเกม
    codes?: string[]; // โค้ดรางวัลธรรมดา
    codeCursor?: number; // ตำแหน่งโค้ดปัจจุบัน
    claimedBy?: Record<string, any>; // ใครได้รับโค้ดแล้ว
    bigPrizeCodes?: string[]; // โค้ดรางวัลใหญ่
    bigPrizeCodeCursor?: number; // ตำแหน่งโค้ดรางวัลใหญ่ปัจจุบัน
    bigPrizeClaimedBy?: Record<string, any>; // ใครได้รับรางวัลใหญ่แล้ว
    playerCount?: number; // จำนวนผู้เล่นที่เล่นแล้ว (สำหรับคำนวณทุกๆ 20)
  };
  referral?: {
    imageDataUrl?: string;
    depositData?: Array<{ referrer: string; referred: string }>;
    registerData?: Array<{ referrer: string; referred: string }>;
    prizes?: {
      rank1: number;
      rank2: number;
      rank3: number;
      rank4to10: number;
      rank11to50: number;
    };
    ended?: boolean;
    endedAt?: number;
  };
  /** เกมป๊อกเด้ง — ผู้เล่นสู้กับ NPC, 1 รอบ/คน, ชนะรับโค้ด */
  pokDeng?: {
    /** อัตราที่ผู้เล่นจะ "ชนะ" NPC (%) 0-100 — ระบบจะ pre-determine ผลตามอัตรานี้ (default 50) */
    playerWinChance?: number;
    /** กฎการเปรียบเทียบ — true = แต้มเสมอแต่เด้งสูงกว่าเป็นชนะ; false = เสมอเสมอ */
    tieBreakerByDeng?: boolean;
    /** กฎ NPC: NPC จั่วเมื่อแต้มต่ำกว่าค่านี้ (default 5 = NPC stand 5+, draw 0–4) */
    npcStandThreshold?: number;
    /** หลังเล่นจบ (ชนะ/แพ้/เสมอ) อนุญาตให้เล่นซ้ำหรือไม่ — default false (1 รอบ/คน) */
    allowReplay?: boolean;
    /** Snapshot ของผลแต่ละ user (เก็บไว้แสดง/กันโกง) */
    results?: Record<
      string,
      {
        outcome: 'win' | 'lose' | 'tie';
        playerHand?: string[]; // เช่น ['10♠','9♥']
        npcHand?: string[];
        playerScore?: number;
        npcScore?: number;
        playerType?: string; // 'pok9'|'pok8'|'tong'|'sam_lueng'|'straight'|'same_suit'|'normal'
        npcType?: string;
        deng?: number;
        code?: string | null;
        ts?: number;
      }
    >;
  };
};
