# 🔐 Настройка Яндекс OAuth для авторизации

## Шаг 1: Регистрация приложения в Яндекс OAuth

1. Перейдите на https://oauth.yandex.ru/client/new
2. Заполните данные приложения:

### Основные данные
- **Название приложения**: `Music Collab` (или любое другое)
- **Контактный email**: ваш email
- **Описание**: Приложение для совместного прослушивания музыки

### Redirect URI
Добавьте **Redirect URI**:
```
http://localhost:3000/auth/callback
```

**Важно**: Этот URI должен точно совпадать с `YANDEX_REDIRECT_URI` в `.env`!

### Платформы
- Выберите **Web-сервисы**

### Данные Яндекса (разрешения)
Отметьте следующие разрешения:
- ✅ **Доступ к логину** (`login:info`)
- ✅ **Доступ к аватару** (`login:avatar`)
- ✅ **Доступ к имени и фамилии** (`login:login`) - опционально

**Важно**: Разрешения `playlist:read` и `playlist:write` **НЕдоступны** в публичном OAuth Яндекса (2026). Сохранение треков реализовано через локальную БД приложения.

## Шаг 2: Получение ключей

После создания приложения вы получите:
- **Client ID** (идентификатор приложения)
- **Client Secret** (секретный ключ)

## Шаг 3: Настройка .env файла

Откройте файл `/back-end/server/.env` и замените значения:

```env
# === Yandex OAuth ===
YANDEX_CLIENT_ID=23abc45def67890ghijk  # Ваш Client ID
YANDEX_CLIENT_SECRET=12345678-90ab-cdef-ghij-klmnopqrstuv  # Ваш Client Secret
YANDEX_REDIRECT_URI=http://localhost:3000/auth/callback
```

## Шаг 4: Перезапуск сервера

После изменения `.env` перезапустите сервер:

```bash
cd /home/semyonhartov/Code/muscolab-qwen/back-end/server
npm run dev
```

## Шаг 5: Проверка авторизации

1. Откройте браузер (позже, когда будет фронтенд)
2. Перейдите на `/auth/yandex`
3. Авторизуйтесь через Яндекс
4. Проверьте логи сервера — должны быть сообщения:
   ```
   OAuth callback received: { code: 'present' }
   Exchanging code for tokens...
   Tokens received: { accessToken: 'present', refreshToken: 'present' }
   Fetching Yandex profile...
   Profile received: { id: '...', login: '...' }
   ```

## 🔍 Отладка

Если авторизация не работает:

### Ошибка: "OAuth error: access_denied"
- Проверьте, что Redirect URI в приложении Яндекс совпадает с `YANDEX_REDIRECT_URI` в `.env`

### Ошибка: "Invalid client"
- Проверьте `YANDEX_CLIENT_ID` и `YANDEX_CLIENT_SECRET` в `.env`
- Убедитесь, что нет лишних пробелов

### Ошибка: "Cannot destructure property 'id' of 'yandexProfile'"
- Смотрите логи сервера — там будет полный ответ от Яндекс API
- Возможно, токен недействителен или API вернуло ошибку

### Проверка токена вручную

```bash
# После получения кода из callback URL
curl -X POST https://oauth.yandex.ru/token \
  -d "grant_type=authorization_code" \
  -d "code=YOUR_CODE" \
  -d "client_id=YOUR_CLIENT_ID" \
  -d "client_secret=YOUR_CLIENT_SECRET" \
  -d "redirect_uri=http://localhost:3000/auth/callback"
```

## 📝 Примечания

1. **Тестовый аккаунт**: Используйте отдельный аккаунт Яндекс для тестирования
2. **Срок действия токена**: Access токен действует 24 часа, refresh токен — 1 год
3. **Безопасность**: Никогда не коммитьте `.env` в Git!
