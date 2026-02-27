# 📂 HỒ SƠ TỔNG THỂ DỰ ÁN: REYNA - PERSONAL MANAGER WEB APP

Tài liệu này đóng vai trò là "Kiến thức lõi" của dự án Reyna. Nó được thiết kế để bất kỳ AI hoặc lập trình viên nào khi đọc vào cũng có thể nắm bắt 100% linh hồn, cấu trúc và các logic phức tạp của ứng dụng.

---

## 1. TỔNG QUAN HỆ THỐNG
- **Tên dự án:** Reyna (Personal Manager)
- **Mục tiêu:** Quản lý tập trung các thông tin nhạy cảm (Email, Thẻ tín dụng, Lịch hẹn/Báo thức) với trải nghiệm người dùng cao cấp, bảo mật và tốc độ tối ưu.
- **Tech Stack:**
  - **Frontend:** React + Vite + TypeScript.
  - **Styling:** Tailwind CSS (Vanila). Trải nghiệm Glassmorphism, Modern Dark/Light Mode.
  - **Database Local:** Dexie.js (IndexedDB). Giữ ứng dụng luôn nhanh và hỗ trợ Offline-first.
  - **Database Remote:** Firebase Firestore. Đồng bộ hóa Real-time đa thiết bị.
  - **Deployment:** GitHub Pages (Kèm script hỗ trợ Single Page Application).

---

## 2. KIẾN TRÚC DỮ LIỆU & ĐỒNG BỘ 💎 (CRITICAL)
Đây là phần quan trọng nhất giúp app xử lý được hàng trăm nghìn dòng dữ liệu mà không tốn phí.

### A. Luồng đồng bộ Lai (Hybrid Sync)
Ứng dụng không bao giờ đọc lại toàn bộ Firestore mỗi lần mở app.
1.  **Hydration (Nạp nhanh):** Khi đăng nhập lần đầu, app tải các **Snapshot (Mega-Documents)**. Mỗi Snapshot chứa ~2000 dòng dữ liệu đã được nén. Điều này giảm chi phí đọc Firestore từ 100,000 lượt xuống còn ~50 lượt.
2.  **Delta Sync (Bù đắp):** Sau khi nạp Snapshot, app dùng `onSnapshot` của Firestore với điều kiện `updatedAt > thời điểm snapshot` để lấy các thay đổi mới nhất (thêm/sửa/xóa).
3.  **Local Storage (Dexie):** Mọi dữ liệu sau khi tải về được lưu vào Dexie. UI sẽ phản ứng (reactive) trực tiếp từ Dexie, không chờ Firestore.

### B. Snapshot System (Tự động đóng gói)
- **SnapshotService:** Tự động theo dõi lượng dữ liệu "lẻ". Khi dữ liệu mới phát sinh đủ ~2000 dòng, app tự động đóng gói chúng thành một Snapshot Chunk mới và đẩy lên Firestore.
- **Vị trí:** Logic này tích hợp trong `useFirestoreSync` và `SnapshotService`.

---

## 3. CÁC THỰC THỂ CHÍNH (DATA MODELS)

| Thực thể | Collection | Mô tả | Key Fields |
| :--- | :--- | :--- | :--- |
| **Emails** | `emails` | Quản lý tài khoản, 2FA, trạng thái Live. | `email`, `password`, `secret2FA`, `categoryId`, `status` |
| **Cards** | `cards` | Quản lý thông tin thẻ và mối liên kết. | `cardNumber`, `cvv`, `expiryDate`, `linkedEmails[]`, `payAmount` |
| **Categories** | `categories` | Phân loại Email, hiển thị ở Sidebar. | `name`, `order`, `updatedAt` |
| **Statuses** | `statuses` | Trạng thái tùy chỉnh (Màu sắc, Icon). | `name`, `collection` (cards/emails), `colorDot` |
| **Alarms** | `alarms` | Hẹn giờ thanh toán hoặc kiểm tra card/email. | `triggerAt`, `recordId`, `fired`, `message` |

---

## 4. CÁC TÍNH NĂNG KỸ THUẬT ĐẶC SẮC

### 🛡️ Bảo mật (Security)
- **PinGuard:** Ứng dụng được bảo vệ bởi mã PIN. Hash của PIN được lưu trong Firestore và cache local.
- **Data Masking:** Mặc định các thông tin nhạy cảm (CVV, Password) bị ẩn (`***`). Chúng chỉ hiện khi:
  - Bật mắt toàn cục (`useVisibility`).
  - Hoặc hover chuột vào dòng tương ứng trong bảng.

### ⏰ Hệ thống Báo thức (Alarm System)
- Chạy ngầm thông qua `useAlarms` hook.
- **Prefix Logic:** Để phân biệt ngữ cảnh, Alarm tạo trong Category Explorer có ID tiền tố `category_card_`, trong khi Alarm global dùng trực tiếp `recordId`.

### 🖥️ Category Explorer (Cơ chế liên kết)
- Là màn hình chia đôi (Split Pane):
  - Bên trái (35%): Danh sách Email thuộc Category.
  - Bên phải (65%): Danh sách Thẻ (Cards) được **liên kết** với Email đó.
- Cho phép Add/Unlink Card vào Email ngay tại chỗ.

---

## 5. NGÔN NGỮ THIẾT KẾ & UI/UX
- **Z-Index Strategy:** Sử dụng `z-[9999]` cho các Modal phủ toàn màn hình để tránh bị đè bởi Sticky Header của bảng. Các Row trong bảng khi được hover sẽ được nâng `z-index` để Dropdown không bị cắt cụt.
- **Inline Editing:** Ưu tiên sửa trực tiếp trên bảng (Double-click để sửa, Click out để Save).
- **Feedback:** Sử dụng `sonner` cho Toast. Không sử dụng `alert()` hay `confirm()` bản gốc, thay bằng Modal Tailwind hoặc Inline Confirmation ("Sure?").

---

## 6. CẤU HÌNH DEPLOY (GITHUB PAGES)
Do GitHub Pages không hỗ trợ SPA theo mặc định, dự án sử dụng:
1.  **`404.html`:** Chụp lại các route không tồn tại (vd: `/dashboard`) và chuyển hướng về `index.html` kèm tham số.
2.  **`index.html`:** Chứa script giải mã tham số từ `404.html` và gọi `window.history.replaceState` để khôi phục URL chuẩn cho React Router.

---

## 7. CẤU TRÚC THƯMỤC CHÍNH
- `/src/app/hooks`: Chứa logic nghiệp vụ (Sync, Alarm, Pin, Visibility).
- `/src/app/services`: Chứa `SyncService` và `SnapshotService` (Logic Backend).
- `/src/app/components`: Các UI Component tái sử dụng cao.
- `/src/app/pages`: Các màn hình chính (Dashboard, Category Explorer).
- `/public`: Chứa `404.html` và các tài nguyên tĩnh.

---

## 8. LƯU Ý CHO TƯƠNG LAI
- **Mở rộng:** Khi số lượng Snapshot quá lớn, có thể cần logic dọn dẹp (cleanup) các Chunk cũ nếu dữ liệu trong đó đã bị xóa hết.
- **Build:** Luôn sử dụng `npm run build` và kiểm tra thư mục `dist` trước khi đẩy lên. Lưu ý `base path` trong `vite.config.ts` phải khớp với tên Repository.

---
*Tài liệu này được soạn thảo để lưu giữ tính toàn vẹn của dự án qua các giai đoạn phát triển.*
