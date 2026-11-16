import { useState, useEffect } from "react";
import "./App.css";

// إعدادات الحقول: الفورم يُبنى منها ديناميكياً
const fields = [
  { id: "fullName", label: "الاسم الكامل", type: "text", required: true },
  { id: "age", label: "العمر", type: "number", required: true, min: 1, max: 120 },
  { id: "birthDate", label: "تاريخ الميلاد", type: "date", required: true },
  { id: "userFile", label: "ملف (صورة / مستند)", type: "file" },
  { id: "userVideo", label: "فيديو", type: "file", accept: ".mp4,.webm,.mov,.mkv,.avi" },
  { id: "userAudio", label: "صوت", type: "file", accept: ".mp3,.wav,.ogg,.m4a,.aac" },
];

const STORAGE_KEY = "formEntries";

/* ========= IndexedDB: لتخزين الملفات الكبيرة ========= */
const DB_NAME = "formFilesDB";
const STORE = "files";

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbRun(mode, action) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const request = action(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(request?.result);
    tx.onerror = () => reject(tx.error);
  });
}

const saveFileToDB = (key, file) => dbRun("readwrite", (s) => s.put(file, key));
const getFileFromDB = (key) => dbRun("readonly", (s) => s.get(key));
const deleteFileFromDB = (key) => dbRun("readwrite", (s) => s.delete(key));
const clearFilesDB = () => dbRun("readwrite", (s) => s.clear());

/* ========= LocalStorage: للبيانات النصية وبيانات الملفات ========= */
function loadEntries() {
  try {
    const list = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    // حذف الإدخالات القديمة (من النسخة السابقة) التي حُفظ فيها الملف كنص ضخم
    const clean = list.filter((entry) =>
      Object.values(entry).every((v) => !v || typeof v !== "object" || v.key)
    );
    if (clean.length !== list.length) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
    }
    return clean;
  } catch {
    return [];
  }
}

// عرض ملف حسب نوعه (يُقرأ من IndexedDB)
function Media({ file }) {
  const [url, setUrl] = useState(null);

  useEffect(() => {
    let objectUrl;
    let cancelled = false;
    getFileFromDB(file.key).then((blob) => {
      if (blob && !cancelled) {
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      }
    });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [file.key]);

  if (!url) return <span>جاري التحميل...</span>;
  if (file.type.startsWith("image/")) return <img src={url} alt={file.name} />;
  if (file.type.startsWith("video/")) return <video src={url} controls />;
  if (file.type.startsWith("audio/")) return <audio src={url} controls />;
  return (
    <a href={url} download={file.name}>
      تحميل: {file.name}
    </a>
  );
}

export default function App() {
  const [values, setValues] = useState({}); // قيم الحقول النصية
  const [selectedFiles, setSelectedFiles] = useState({}); // الملفات المختارة
  const [errors, setErrors] = useState({});
  const [entries, setEntries] = useState(loadEntries);
  const [formKey, setFormKey] = useState(0); // لتفريغ حقول الملفات بعد الإرسال

  const handleChange = (e) => {
    const { name, value } = e.target;
    setValues((prev) => ({ ...prev, [name]: value }));
  };

  const handleFile = (e) => {
    const { name, files } = e.target;
    setSelectedFiles((prev) => ({ ...prev, [name]: files[0] || null }));
  };

  const validate = () => {
    const newErrors = {};
    fields.forEach((f) => {
      if (f.required && !(values[f.id] || "").trim()) {
        newErrors[f.id] = "هذا الحقل مطلوب";
      }
    });
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    const entry = {};
    const savedKeys = [];

    try {
      for (const f of fields) {
        if (f.type === "file") {
          const file = selectedFiles[f.id];
          if (file) {
            const key = `${Date.now()}-${f.id}-${Math.random().toString(36).slice(2)}`;
            await saveFileToDB(key, file); // الملف نفسه في IndexedDB
            savedKeys.push(key);
            entry[f.id] = { key, name: file.name, type: file.type, size: file.size };
          } else {
            entry[f.id] = null;
          }
        } else {
          entry[f.id] = (values[f.id] || "").trim();
        }
      }

      const newList = [...entries, entry];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newList)); // البيانات في LocalStorage
      setEntries(newList);

      setValues({});
      setSelectedFiles({});
      setErrors({});
      setFormKey((k) => k + 1);
    } catch {
      await Promise.all(savedKeys.map(deleteFileFromDB));
      alert("تعذّر حفظ البيانات. تأكد من وجود مساحة كافية في المتصفح.");
    }
  };

  const handleDelete = async (index) => {
    const entry = entries[index];
    for (const f of fields) {
      if (f.type === "file" && entry[f.id]) {
        await deleteFileFromDB(entry[f.id].key);
      }
    }
    const newList = entries.filter((_, i) => i !== index);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newList));
    setEntries(newList);
  };

  const handleClear = async () => {
    if (!window.confirm("هل تريد حذف كل البيانات؟")) return;
    await clearFilesDB();
    localStorage.removeItem(STORAGE_KEY);
    setEntries([]);
  };

  return (
    <main className="container" dir="rtl">
      <h1>Form Handling</h1>

      <form key={formKey} onSubmit={handleSubmit} noValidate>
        {fields.map((f) => (
          <div className="field" key={f.id}>
            <label htmlFor={f.id}>{f.label}</label>
            {f.type === "file" ? (
              <input
                id={f.id}
                name={f.id}
                type="file"
                accept={f.accept}
                onChange={handleFile}
              />
            ) : (
              <input
                id={f.id}
                name={f.id}
                type={f.type}
                min={f.min}
                max={f.max}
                value={values[f.id] || ""}
                onChange={handleChange}
                className={errors[f.id] ? "invalid" : ""}
              />
            )}
            <div className="error">{errors[f.id]}</div>
          </div>
        ))}
        <button type="submit">Submit</button>
      </form>

      <div className="section-head">
        <h2>البيانات المُدخلة</h2>
        {entries.length > 0 && (
          <button type="button" className="danger" onClick={handleClear}>
            مسح الكل
          </button>
        )}
      </div>

      {entries.length === 0 && <p className="empty">لا توجد بيانات بعد.</p>}

      {entries.map((entry, index) => (
        <div className="card" key={index}>
          <div className="card-head">
            <strong>#{index + 1}</strong>
            <button
              type="button"
              className="danger"
              onClick={() => handleDelete(index)}
            >
              حذف
            </button>
          </div>
          {fields.map((f) => {
            const value = entry[f.id];
            if (f.type === "file" && !value) return null;
            return (
              <div className="row" key={f.id}>
                <span className="key">{f.label}: </span>
                {f.type === "file" ? <Media file={value} /> : value || "-"}
              </div>
            );
          })}
        </div>
      ))}
    </main>
  );
}
