import React, { useState, useMemo, useEffect } from 'react';
import { Search, Book, CheckCircle, Languages, Volume2, ArrowRight, Loader2, Info, LogIn, LogOut, Star, Trophy, RefreshCcw, User as UserIcon, Calendar, Sparkles, Mic, MicOff } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { vocabularyData, WordPair } from './vocabularyData';
import { getWordMeaning, checkGrammar, translateKannadaToEnglish, translateBidirectional, WordMeaning, GrammarCorrection, TranslationResult } from './geminiService';
import { auth, db, googleProvider, signInWithPopup, signOut, onAuthStateChanged, User, doc, getDoc, setDoc, collection, query, where, onSnapshot, addDoc, deleteDoc, serverTimestamp, handleFirestoreError, OperationType } from './firebase';

type Tab = 'meaning' | 'vocabulary' | 'grammar' | 'translation' | 'voice' | 'saved' | 'quiz' | 'profile';

interface QuizQuestion {
  question: string;
  options: string[];
  correctAnswer: string;
  kannadaHint: string;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('meaning');
  const [user, setUser] = useState<User | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);

  const [searchWord, setSearchWord] = useState('');
  const [wordResult, setWordResult] = useState<WordMeaning | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [vocabSearch, setVocabSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');

  const [grammarText, setGrammarText] = useState('');
  const [grammarResult, setGrammarResult] = useState<GrammarCorrection | null>(null);

  const [translationText, setTranslationText] = useState('');
  const [translationResult, setTranslationResult] = useState<TranslationResult | null>(null);

  const [isListening, setIsListening] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [voiceResult, setVoiceResult] = useState<TranslationResult | null>(null);

  const [savedWords, setSavedWords] = useState<any[]>([]);

  const [quizStarted, setQuizStarted] = useState(false);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
  const [score, setScore] = useState(0);
  const [quizFinished, setQuizFinished] = useState(false);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);

  const [wordOfTheDay, setWordOfTheDay] = useState<WordPair | null>(null);

  const [userStats, setUserStats] = useState({
    wordsLearned: 0,
    quizzesTaken: 0,
    averageScore: 0
  });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setLoadingAuth(false);
      if (currentUser) {
        const userRef = doc(db, 'users', currentUser.uid);
        try {
          const userSnap = await getDoc(userRef);
          if (!userSnap.exists()) {
            await setDoc(userRef, {
              uid: currentUser.uid,
              email: currentUser.email,
              displayName: currentUser.displayName,
              photoURL: currentUser.photoURL,
              createdAt: serverTimestamp(),
              role: 'user'
            });
          }
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, `users/${currentUser.uid}`);
        }
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) { setSavedWords([]); return; }
    const q = query(collection(db, 'users', user.uid, 'savedWords'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setSavedWords(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, `users/${user.uid}/savedWords`);
    });
    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const statsRef = doc(db, 'users', user.uid, 'progress', 'stats');
    const unsubscribe = onSnapshot(statsRef, (doc) => {
      if (doc.exists()) setUserStats(doc.data() as any);
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, `users/${user.uid}/progress/stats`);
    });
    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    const today = new Date().toDateString();
    let seed = 0;
    for (let i = 0; i < today.length; i++) seed += today.charCodeAt(i);
    setWordOfTheDay(vocabularyData[seed % vocabularyData.length]);
  }, []);

  const handleLogin = async () => { try { await signInWithPopup(auth, googleProvider); } catch (err) { console.error(err); } };
  const handleLogout = async () => { try { await signOut(auth); } catch (err) { console.error(err); } };

  const categories = useMemo(() => ['All', ...Array.from(new Set(vocabularyData.map(v => v.category)))], []);
  const filteredVocab = useMemo(() => vocabularyData.filter(v => {
    const matchesSearch = v.english.toLowerCase().includes(vocabSearch.toLowerCase()) || v.kannada.toLowerCase().includes(vocabSearch.toLowerCase());
    return matchesSearch && (selectedCategory === 'All' || v.category === selectedCategory);
  }), [vocabSearch, selectedCategory]);

  const handleWordLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchWord.trim()) return;
    setLoading(true); setError(null); setWordResult(null);
    try { setWordResult(await getWordMeaning(searchWord)); }
    catch (err) { setError('Failed to fetch meaning. Please try again.'); console.error(err); }
    finally { setLoading(false); }
  };

  const saveWord = async (word: WordMeaning) => {
    if (!user) { alert("Please login to save words!"); return; }
    try {
      await addDoc(collection(db, 'users', user.uid, 'savedWords'), {
        userId: user.uid, word: word.word, meaning: word.meaning,
        kannadaTranslation: word.kannadaTranslation, pronunciation: word.pronunciation, savedAt: serverTimestamp()
      });
    } catch (err) { handleFirestoreError(err, OperationType.CREATE, `users/${user.uid}/savedWords`); }
  };

  const removeSavedWord = async (id: string) => {
    if (!user) return;
    try { await deleteDoc(doc(db, 'users', user.uid, 'savedWords', id)); }
    catch (err) { handleFirestoreError(err, OperationType.DELETE, `users/${user.uid}/savedWords/${id}`); }
  };

  const handleGrammarCheck = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!grammarText.trim()) return;
    setLoading(true); setError(null); setGrammarResult(null);
    try { setGrammarResult(await checkGrammar(grammarText)); }
    catch (err) { setError('Failed to check grammar. Please try again.'); console.error(err); }
    finally { setLoading(false); }
  };

  const handleTranslation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!translationText.trim()) return;
    setLoading(true); setError(null); setTranslationResult(null);
    try { setTranslationResult(await translateKannadaToEnglish(translationText)); }
    catch (err) { setError('Failed to translate. Please try again.'); console.error(err); }
    finally { setLoading(false); }
  };

  const startListening = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) { setError("Speech recognition is not supported in this browser."); return; }
    const recognition = new SpeechRecognition();
    recognition.lang = 'kn-IN';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onstart = () => { setIsListening(true); setVoiceTranscript(''); setVoiceResult(null); };
    recognition.onresult = async (event: any) => {
      const transcript = event.results[0][0].transcript;
      setVoiceTranscript(transcript);
      setIsListening(false);
      setLoading(true);
      try { setVoiceResult(await translateBidirectional(transcript)); }
      catch (err) { setError("Failed to process voice command."); console.error(err); }
      finally { setLoading(false); }
    };
    recognition.onerror = (event: any) => { setIsListening(false); setError(`Voice error: ${event.error}`); };
    recognition.onend = () => { setIsListening(false); };
    recognition.start();
  };

  const startQuiz = () => {
    const shuffled = [...vocabularyData].sort(() => 0.5 - Math.random());
    const questions: QuizQuestion[] = shuffled.slice(0, 5).map(item => {
      const options = [item.english];
      while (options.length < 4) {
        const randomWord = vocabularyData[Math.floor(Math.random() * vocabularyData.length)].english;
        if (!options.includes(randomWord)) options.push(randomWord);
      }
      return { question: `What is the English word for "${item.kannada}"?`, options: options.sort(() => 0.5 - Math.random()), correctAnswer: item.english, kannadaHint: item.kannada };
    });
    setQuizQuestions(questions); setQuizStarted(true); setCurrentQuestionIndex(0); setScore(0); setQuizFinished(false); setSelectedOption(null); setIsCorrect(null);
  };

  const handleQuizAnswer = (option: string) => {
    if (selectedOption) return;
    setSelectedOption(option);
    const correct = option === quizQuestions[currentQuestionIndex].correctAnswer;
    setIsCorrect(correct);
    if (correct) setScore(s => s + 1);
    setTimeout(() => {
      if (currentQuestionIndex < quizQuestions.length - 1) { setCurrentQuestionIndex(i => i + 1); setSelectedOption(null); setIsCorrect(null); }
      else { finishQuiz(); }
    }, 1500);
  };

  const finishQuiz = async () => {
    setQuizFinished(true);
    if (user) {
      const statsRef = doc(db, 'users', user.uid, 'progress', 'stats');
      try {
        const statsSnap = await getDoc(statsRef);
        const currentStats = statsSnap.exists() ? statsSnap.data() : { wordsLearned: 0, quizzesTaken: 0, averageScore: 0 };
        const newQuizzesTaken = (currentStats.quizzesTaken || 0) + 1;
        const newAverage = ((currentStats.averageScore || 0) * (currentStats.quizzesTaken || 0) + (score / quizQuestions.length * 100)) / newQuizzesTaken;
        await setDoc(statsRef, { userId: user.uid, wordsLearned: (currentStats.wordsLearned || 0) + score, quizzesTaken: newQuizzesTaken, averageScore: Math.round(newAverage), lastActive: serverTimestamp() });
      } catch (err) { handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}/progress/stats`); }
    }
  };

  if (loadingAuth) {
    return (<div className="min-h-screen bg-indigo-950 flex items-center justify-center"><Loader2 className="w-12 h-12 text-blue-500 animate-spin" /></div>);
  }

  const navTabs = [
    { id: 'meaning', label: 'Search', icon: Search },
    { id: 'voice', label: 'Voice', icon: Mic },
    { id: 'grammar', label: 'Grammar', icon: CheckCircle },
    { id: 'translation', label: 'Translate', icon: Languages },
    { id: 'vocabulary', label: 'Words', icon: Book },
    { id: 'quiz', label: 'Quiz', icon: Trophy },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-950 via-purple-950 to-blue-950 text-white font-sans selection:bg-blue-500/30 overflow-x-hidden">
      {/* Header */}
      <header className="pt-4 md:pt-8 pb-2 md:pb-4 px-4 md:px-6 flex justify-between items-center max-w-6xl mx-auto">
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-2 md:gap-3 cursor-pointer" onClick={() => setActiveTab('meaning')}>
          <div className="p-1.5 md:p-2 bg-blue-500/20 rounded-lg md:rounded-xl border border-blue-500/30">
            <Languages className="w-6 h-6 md:w-8 md:h-8 text-blue-400" />
          </div>
          <h1 className="text-2xl md:text-3xl font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-400">ಕಲೆ-NANDU</h1>
        </motion.div>
        <div className="flex items-center gap-2 md:gap-4">
        </div>
      </header>

      {/* Desktop Navigation */}
      <nav className="hidden md:flex justify-center gap-2 p-4 sticky top-0 z-50 bg-indigo-950/80 backdrop-blur-xl border-b border-white/5">
        {navTabs.map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id as Tab)} className={`flex items-center gap-2 px-6 py-3 rounded-2xl transition-all duration-300 relative group shrink-0 ${activeTab === tab.id ? 'text-white' : 'text-purple-300/60 hover:text-purple-200'}`}>
            {activeTab === tab.id && (<motion.div layoutId="activeTabDesktop" className="absolute inset-0 bg-blue-600 rounded-2xl shadow-lg shadow-blue-600/20" transition={{ type: "spring", bounce: 0.2, duration: 0.6 }} />)}
            <tab.icon className={`w-5 h-5 relative z-10 transition-transform duration-300 ${activeTab === tab.id ? 'scale-110' : 'group-hover:scale-110'}`} />
            <span className="font-semibold relative z-10">{tab.label}</span>
          </button>
        ))}
      </nav>

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-indigo-950/90 backdrop-blur-2xl border-t border-white/10">
        <div className="flex justify-around items-center p-2">
          {navTabs.map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id as Tab)} className={`flex flex-col items-center gap-1 p-2 transition-all duration-300 relative ${activeTab === tab.id ? 'text-blue-400' : 'text-purple-300/50'}`}>
              {activeTab === tab.id && (<motion.div layoutId="activeTabMobile" className="absolute -top-2 w-8 h-1 bg-blue-500 rounded-full" transition={{ type: "spring", bounce: 0.2, duration: 0.6 }} />)}
              <tab.icon className={`w-5 h-5 transition-transform duration-300 ${activeTab === tab.id ? 'scale-110' : ''}`} />
              <span className="text-[10px] font-bold uppercase tracking-tighter">{tab.label}</span>
            </button>
          ))}
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto p-4 md:p-6 pb-32 md:pb-24">
        <AnimatePresence mode="wait">

          {activeTab === 'meaning' && (
            <motion.div key="meaning" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="space-y-8">
              {wordOfTheDay && !wordResult && (
                <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-gradient-to-br from-blue-600/20 to-purple-600/20 border border-white/10 rounded-[2.5rem] p-8 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:scale-110 transition-transform"><Sparkles className="w-24 h-24 text-blue-400" /></div>
                  <div className="flex items-center gap-2 text-blue-400 font-black uppercase text-xs tracking-[0.3em] mb-4"><Calendar className="w-4 h-4" />Word of the Day</div>
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
                    <div>
                      <h3 className="text-4xl md:text-5xl font-black text-white mb-1 md:mb-2">{wordOfTheDay.english}</h3>
                      <p className="text-xl md:text-2xl text-purple-200 font-medium">{wordOfTheDay.kannada}</p>
                    </div>
                    <button onClick={() => { setSearchWord(wordOfTheDay.english); handleWordLookup({ preventDefault: () => {} } as any); }} className="w-full sm:w-auto px-6 py-3 bg-blue-600 hover:bg-blue-500 rounded-xl font-bold text-lg transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20">
                      Learn More <ArrowRight className="w-5 h-5" />
                    </button>
                  </div>
                </motion.div>
              )}
              <div className="text-center space-y-2 mb-8">
                <h2 className="text-3xl font-bold text-white">Word Meaning Lookup</h2>
                <p className="text-purple-300">ಪದದ ಅರ್ಥ ಮತ್ತು ವಿವರಣೆ ತಿಳಿಯಿರಿ</p>
              </div>
              <form onSubmit={handleWordLookup} className="relative group">
                <div className="absolute -inset-1 bg-gradient-to-r from-blue-600 to-purple-600 rounded-3xl blur opacity-25 group-focus-within:opacity-50 transition duration-1000"></div>
                <div className="relative">
                  <input type="text" value={searchWord} onChange={(e) => setSearchWord(e.target.value)} placeholder="Enter an English word..." className="w-full p-5 md:p-6 pl-14 md:pl-16 rounded-2xl bg-indigo-900/50 border border-white/10 focus:outline-none focus:border-blue-500/50 text-xl md:text-2xl placeholder:text-purple-300/40 backdrop-blur-xl" />
                  <Search className="absolute left-5 md:left-6 top-1/2 -translate-y-1/2 text-blue-400 w-6 h-6 md:w-7 md:h-7" />
                  <button type="submit" disabled={loading} className="absolute right-2 md:right-3 top-1/2 -translate-y-1/2 bg-blue-600 hover:bg-blue-500 px-4 md:px-8 py-2 md:py-3 rounded-xl font-bold transition-all disabled:opacity-50 text-sm md:text-base">
                    {loading ? <Loader2 className="w-5 h-5 md:w-6 md:h-6 animate-spin" /> : 'Search'}
                  </button>
                </div>
              </form>
              {error && (<div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-300 text-center flex items-center justify-center gap-2"><Info className="w-5 h-5" />{error}</div>)}
              {wordResult && (
                <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white/5 backdrop-blur-2xl border border-white/10 rounded-[2.5rem] p-10 space-y-8 shadow-2xl relative">
                  <div className="flex flex-col sm:flex-row justify-between items-start gap-6">
                    <div className="space-y-3">
                      <div className="flex items-center gap-4">
                        <h2 className="text-4xl md:text-6xl font-black text-white tracking-tighter">{wordResult.word}</h2>
                        <Volume2 className="w-6 h-6 text-blue-400 cursor-pointer hover:scale-110 transition-transform" />
                      </div>
                      <div className="px-3 py-1 bg-blue-500/10 rounded-lg text-sm font-mono border border-blue-500/20 inline-block text-blue-300/80">{wordResult.pronunciation}</div>
                    </div>
                    <div className="w-full sm:w-auto bg-gradient-to-br from-blue-500 to-purple-600 px-6 md:px-8 py-3 md:py-4 rounded-2xl shadow-xl">
                      <span className="text-lg md:text-2xl font-bold text-white block mb-1">ಕನ್ನಡ ಅರ್ಥ:</span>
                      <span className="text-2xl md:text-3xl font-black text-white">{wordResult.kannadaTranslation}</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-8 pt-8 border-t border-white/5">
                    <section className="space-y-4">
                      <h3 className="text-xl font-bold text-blue-400 flex items-center gap-2"><div className="w-2 h-8 bg-blue-500 rounded-full" />English Meaning</h3>
                      <p className="text-xl text-purple-100 leading-relaxed pl-4">{wordResult.meaning}</p>
                    </section>
                    <section className="space-y-4">
                      <h3 className="text-xl font-bold text-purple-400 flex items-center gap-2"><div className="w-2 h-8 bg-purple-500 rounded-full" />Example Sentences</h3>
                      <div className="grid gap-4 pl-4">
                        {wordResult.exampleSentences.map((sentence, i) => (
                          <div key={i} className="flex gap-4 text-purple-200 bg-white/5 p-5 rounded-2xl border border-white/5">
                            <div className="w-8 h-8 rounded-full bg-purple-500/10 flex items-center justify-center text-purple-400 font-bold shrink-0">{i + 1}</div>
                            <span className="text-lg">{sentence}</span>
                          </div>
                        ))}
                      </div>
                    </section>
                  </div>
                </motion.div>
              )}
            </motion.div>
          )}

          {activeTab === 'voice' && (
            <motion.div key="voice" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="space-y-8">
              <div className="text-center space-y-2 mb-8">
                <h2 className="text-3xl font-bold text-white">Voice Assistant</h2>
                <p className="text-purple-300">ಧ್ವನಿ ಮೂಲಕ ಅನುವಾದಿಸಿ (Kannada ↔ English)</p>
              </div>
              <div className="flex flex-col items-center justify-center space-y-8 py-12 bg-white/5 rounded-[3rem] border border-white/10 backdrop-blur-xl">
                <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={startListening} disabled={isListening || loading}
                  className={`w-32 h-32 rounded-full flex items-center justify-center transition-all shadow-2xl relative ${isListening ? 'bg-red-500 shadow-red-500/40' : 'bg-blue-600 shadow-blue-600/40 hover:bg-blue-500'}`}>
                  {isListening && (<motion.div initial={{ scale: 1, opacity: 0.5 }} animate={{ scale: 1.5, opacity: 0 }} transition={{ repeat: Infinity, duration: 1.5 }} className="absolute inset-0 bg-red-500 rounded-full" />)}
                  {isListening ? <MicOff className="w-12 h-12 text-white" /> : <Mic className="w-12 h-12 text-white" />}
                </motion.button>
                <div className="text-center space-y-2">
                  <p className="text-2xl font-bold text-white">{isListening ? "Listening..." : "Tap to Speak"}</p>
                  <p className="text-purple-300">Try: "Nanna hesaru Sudeep" or "What is your name?"</p>
                </div>
              </div>
              {voiceTranscript && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="p-6 bg-indigo-900/50 border border-white/10 rounded-3xl text-center">
                  <span className="text-purple-300 text-sm uppercase font-black tracking-widest block mb-2">You said:</span>
                  <p className="text-2xl font-bold text-white italic">"{voiceTranscript}"</p>
                </motion.div>
              )}
              {loading && (<div className="flex justify-center py-8"><Loader2 className="w-10 h-10 text-blue-500 animate-spin" /></div>)}
              {voiceResult && (
                <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white/5 backdrop-blur-2xl border border-white/10 rounded-[2.5rem] p-10 space-y-10 shadow-2xl">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="p-8 bg-blue-500/10 border border-blue-500/20 rounded-3xl space-y-4">
                      <div className="text-blue-400 font-black uppercase text-xs tracking-widest">Original</div>
                      <p className="text-2xl text-blue-100/80 leading-relaxed italic">"{voiceResult.original}"</p>
                    </div>
                    <div className="p-8 bg-purple-500/10 border border-purple-500/20 rounded-3xl space-y-4">
                      <div className="text-purple-400 font-black uppercase text-xs tracking-widest">Translation</div>
                      <p className="text-2xl text-white font-black leading-relaxed">"{voiceResult.translated}"</p>
                    </div>
                  </div>
                  <div className="space-y-8 pt-8 border-t border-white/5">
                    <section className="space-y-4">
                      <h3 className="text-xl font-bold text-blue-400 flex items-center gap-2"><div className="w-2 h-8 bg-blue-500 rounded-full" />Explanation</h3>
                      <div className="p-8 bg-white/5 rounded-3xl text-xl text-purple-100 leading-relaxed border border-white/5">{voiceResult.explanation}</div>
                    </section>
                  </div>
                </motion.div>
              )}
            </motion.div>
          )}

          {activeTab === 'vocabulary' && (
            <motion.div key="vocabulary" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="space-y-8">
              <div className="text-center space-y-2 mb-8">
                <h2 className="text-3xl font-bold text-white">Vocabulary Database</h2>
                <p className="text-purple-300">ಪದಕೋಶ ಮತ್ತು ವರ್ಗೀಕೃತ ಪದಗಳು</p>
              </div>
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="relative flex-1 group">
                  <input type="text" value={vocabSearch} onChange={(e) => setVocabSearch(e.target.value)} placeholder="Search words..." className="w-full p-4 md:p-5 pl-12 md:pl-14 rounded-2xl bg-indigo-900/50 border border-white/10 focus:outline-none focus:border-blue-500/50 transition-all" />
                  <Search className="absolute left-4 md:left-5 top-1/2 -translate-y-1/2 text-blue-400 w-5 h-5 md:w-6 md:h-6" />
                </div>
                <select value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)} className="p-4 md:p-5 rounded-2xl bg-indigo-900/50 border border-white/10 focus:outline-none focus:border-blue-500/50 text-purple-200 font-bold cursor-pointer">
                  {categories.map(cat => (<option key={cat} value={cat} className="bg-indigo-950">{cat}</option>))}
                </select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
                {filteredVocab.map((item, i) => (
                  <motion.div key={`${item.english}-${item.category}-${i}`} layout initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="p-6 bg-white/5 border border-white/10 rounded-3xl flex flex-col justify-between hover:bg-white/10 transition-all group">
                    <div>
                      <span className="inline-block px-3 py-1 bg-blue-500/10 text-blue-400 text-[10px] font-black uppercase tracking-[0.2em] rounded-lg mb-3 border border-blue-500/20">{item.category}</span>
                      <h4 className="text-2xl font-black text-white mb-1 group-hover:text-blue-400 transition-colors">{item.english}</h4>
                      <p className="text-xl text-purple-200 font-medium">{item.kannada}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}

          {activeTab === 'grammar' && (
            <motion.div key="grammar" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="space-y-8">
              <div className="text-center space-y-2 mb-8">
                <h2 className="text-3xl font-bold text-white">Grammar Checker</h2>
                <p className="text-purple-300">ವಾಕ್ಯದ ವ್ಯಾಕರಣ ದೋಷಗಳನ್ನು ಸರಿಪಡಿಸಿ</p>
              </div>
              <form onSubmit={handleGrammarCheck} className="space-y-4 md:space-y-6">
                <textarea value={grammarText} onChange={(e) => setGrammarText(e.target.value)} placeholder="Type an English sentence to check..." className="w-full h-40 md:h-56 p-6 md:p-8 rounded-[1.5rem] md:rounded-[2rem] bg-indigo-900/50 border border-white/10 focus:outline-none focus:border-blue-500/50 text-xl md:text-2xl placeholder:text-purple-300/30 backdrop-blur-xl resize-none shadow-inner" />
                <button type="submit" disabled={loading || !grammarText.trim()} className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 py-4 md:py-6 rounded-2xl font-black text-xl md:text-2xl transition-all disabled:opacity-50 flex items-center justify-center gap-3 md:gap-4 shadow-xl">
                  {loading ? <Loader2 className="w-6 h-6 md:w-8 md:h-8 animate-spin" /> : (<><CheckCircle className="w-6 h-6 md:w-8 md:h-8" />Check Grammar</>)}
                </button>
              </form>
              {grammarResult && (
                <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white/5 backdrop-blur-2xl border border-white/10 rounded-[2.5rem] p-10 space-y-10 shadow-2xl">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="p-8 bg-red-500/10 border border-red-500/20 rounded-3xl space-y-4">
                      <div className="text-red-400 font-black uppercase text-xs tracking-widest">Original</div>
                      <p className="text-2xl text-red-100/80 leading-relaxed italic">"{grammarResult.original}"</p>
                    </div>
                    <div className="p-8 bg-green-500/10 border border-green-500/20 rounded-3xl space-y-4">
                      <div className="text-green-400 font-black uppercase text-xs tracking-widest">Corrected</div>
                      <p className="text-2xl text-white font-black leading-relaxed">"{grammarResult.corrected}"</p>
                    </div>
                  </div>
                  <div className="space-y-8 pt-8 border-t border-white/5">
                    <section className="space-y-4">
                      <h3 className="text-xl font-bold text-blue-400 flex items-center gap-2">Explanation</h3>
                      <div className="p-8 bg-white/5 rounded-3xl text-xl text-purple-100 leading-relaxed border border-white/5">{grammarResult.explanation}</div>
                    </section>
                  </div>
                </motion.div>
              )}
            </motion.div>
          )}

          {activeTab === 'translation' && (
            <motion.div key="translation" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="space-y-8">
              <div className="text-center space-y-2 mb-8">
                <h2 className="text-3xl font-bold text-white">Kannada to English Translation</h2>
                <p className="text-purple-300">ಕನ್ನಡ ವಾಕ್ಯಗಳನ್ನು ಇಂಗ್ಲಿಷ್‌ಗೆ ಅನುವಾದಿಸಿ</p>
              </div>
              <form onSubmit={handleTranslation} className="space-y-4 md:space-y-6">
                <textarea value={translationText} onChange={(e) => setTranslationText(e.target.value)} placeholder="Type Kannada text (in Kannada or English script)..." className="w-full h-40 md:h-56 p-6 md:p-8 rounded-[1.5rem] md:rounded-[2rem] bg-indigo-900/50 border border-white/10 focus:outline-none focus:border-blue-500/50 text-xl md:text-2xl placeholder:text-purple-300/30 backdrop-blur-xl resize-none shadow-inner" />
                <button type="submit" disabled={loading || !translationText.trim()} className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 py-4 md:py-6 rounded-2xl font-black text-xl md:text-2xl transition-all disabled:opacity-50 flex items-center justify-center gap-3 md:gap-4 shadow-xl">
                  {loading ? <Loader2 className="w-6 h-6 md:w-8 md:h-8 animate-spin" /> : (<><Languages className="w-6 h-6 md:w-8 md:h-8" />Translate to English</>)}
                </button>
              </form>
              {translationResult && (
                <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white/5 backdrop-blur-2xl border border-white/10 rounded-[2.5rem] p-10 space-y-10 shadow-2xl">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="p-8 bg-blue-500/10 border border-blue-500/20 rounded-3xl space-y-4">
                      <div className="text-blue-400 font-black uppercase text-xs tracking-widest">Kannada (Original)</div>
                      <p className="text-2xl text-blue-100/80 leading-relaxed italic">"{translationResult.original}"</p>
                    </div>
                    <div className="p-8 bg-purple-500/10 border border-purple-500/20 rounded-3xl space-y-4">
                      <div className="text-purple-400 font-black uppercase text-xs tracking-widest">English (Translated)</div>
                      <p className="text-2xl text-white font-black leading-relaxed">"{translationResult.translated}"</p>
                    </div>
                  </div>
                  <div className="space-y-8 pt-8 border-t border-white/5">
                    <section className="space-y-4">
                      <h3 className="text-xl font-bold text-blue-400 flex items-center gap-2"><div className="w-2 h-8 bg-blue-500 rounded-full" />Explanation (ವಿವರಣೆ)</h3>
                      <div className="p-8 bg-white/5 rounded-3xl text-xl text-purple-100 leading-relaxed border border-white/5">{translationResult.explanation}</div>
                    </section>
                    <section className="space-y-4">
                      <h3 className="text-xl font-bold text-purple-400 flex items-center gap-2"><div className="w-2 h-8 bg-purple-500 rounded-full" />Grammar Points</h3>
                      <div className="flex flex-wrap gap-3 pl-4">
                        {translationResult.grammarPoints.map((point, i) => (<span key={i} className="px-6 py-3 bg-indigo-500/20 text-indigo-300 rounded-2xl text-lg font-bold border border-indigo-500/30">{point}</span>))}
                      </div>
                    </section>
                  </div>
                </motion.div>
              )}
            </motion.div>
          )}

          {activeTab === 'saved' && (
            <motion.div key="saved" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="space-y-8">
              <div className="text-center space-y-2 mb-8">
                <h2 className="text-3xl font-bold text-white">Saved Words</h2>
                <p className="text-purple-300">ನೀವು ಉಳಿಸಿದ ಪದಗಳು</p>
              </div>
              {!user ? (
                <div className="text-center py-20 bg-white/5 rounded-[3rem] border border-dashed border-white/10">
                  <LogIn className="w-16 h-16 text-purple-500/30 mx-auto mb-4" />
                  <p className="text-purple-300 text-xl mb-6">Login to see your saved words.</p>
                  <button onClick={handleLogin} className="px-8 py-3 bg-blue-600 rounded-xl font-bold">Login with Google</button>
                </div>
              ) : savedWords.length === 0 ? (
                <div className="text-center py-20 bg-white/5 rounded-[3rem] border border-dashed border-white/10">
                  <Star className="w-16 h-16 text-purple-500/30 mx-auto mb-4" />
                  <p className="text-purple-300 text-xl">You haven't saved any words yet.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {savedWords.map((item) => (
                    <motion.div key={item.id} layout initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="p-8 bg-white/5 border border-white/10 rounded-[2rem] space-y-4 relative group">
                      <button onClick={() => removeSavedWord(item.id)} className="absolute top-6 right-6 p-2 text-purple-400 hover:text-red-400 transition-colors">
                        <Star className="w-6 h-6 fill-yellow-400 text-yellow-400" />
                      </button>
                      <div>
                        <h4 className="text-4xl font-black text-white mb-1">{item.word}</h4>
                        <p className="text-2xl text-blue-400 font-bold">{item.kannadaTranslation}</p>
                      </div>
                      <p className="text-purple-200 text-lg leading-relaxed line-clamp-2">{item.meaning}</p>
                      <button onClick={() => { setSearchWord(item.word); setActiveTab('meaning'); handleWordLookup({ preventDefault: () => {} } as any); }} className="text-blue-400 font-bold flex items-center gap-2 hover:gap-3 transition-all">
                        View Full Details <ArrowRight className="w-4 h-4" />
                      </button>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'quiz' && (
            <motion.div key="quiz" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="space-y-8">
              <div className="text-center space-y-2 mb-8">
                <h2 className="text-3xl font-bold text-white">Quiz Mode</h2>
                <p className="text-purple-300">ನಿಮ್ಮ ಇಂಗ್ಲಿಷ್ ಜ್ಞಾನವನ್ನು ಪರೀಕ್ಷಿಸಿ</p>
              </div>
              {!quizStarted ? (
                <div className="bg-white/5 border border-white/10 rounded-[2rem] md:rounded-[3rem] p-8 md:p-12 text-center space-y-6 md:space-y-8">
                  <div className="w-20 h-20 md:w-24 md:h-24 bg-blue-500/20 rounded-full flex items-center justify-center mx-auto"><Trophy className="w-10 h-10 md:w-12 md:h-12 text-blue-400" /></div>
                  <div className="space-y-3 md:space-y-4">
                    <h3 className="text-3xl md:text-4xl font-black text-white">Ready for a Challenge?</h3>
                    <p className="text-purple-200 text-lg md:text-xl max-w-md mx-auto">Take a quick 5-question quiz based on our vocabulary database.</p>
                  </div>
                  <button onClick={startQuiz} className="w-full sm:w-auto px-10 md:px-12 py-4 md:py-5 bg-blue-600 hover:bg-blue-500 rounded-2xl font-black text-xl md:text-2xl transition-all shadow-xl shadow-blue-600/20">Start Quiz</button>
                </div>
              ) : quizFinished ? (
                <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="bg-white/5 border border-white/10 rounded-[3rem] p-12 text-center space-y-8">
                  <div className="space-y-4">
                    <h3 className="text-5xl font-black text-white">Quiz Completed!</h3>
                    <div className="text-8xl font-black text-blue-400 my-8">{score}/{quizQuestions.length}</div>
                    <p className="text-2xl text-purple-200">{score === quizQuestions.length ? "Perfect Score! ಅದ್ಭುತ!" : score >= 3 ? "Great Job! ಒಳ್ಳೆಯ ಪ್ರಯತ್ನ!" : "Keep Practicing! ಪ್ರಯತ್ನಿಸುತ್ತಿರಿ!"}</p>
                  </div>
                  <div className="flex flex-col md:flex-row gap-4 justify-center">
                    <button onClick={startQuiz} className="px-10 py-4 bg-blue-600 rounded-2xl font-bold text-xl flex items-center justify-center gap-3"><RefreshCcw className="w-6 h-6" /> Try Again</button>
                  </div>
                </motion.div>
              ) : (
                <div className="space-y-8">
                  <div className="flex justify-between items-center px-4">
                    <span className="text-purple-300 font-bold">Question {currentQuestionIndex + 1} of {quizQuestions.length}</span>
                    <div className="w-48 h-3 bg-white/10 rounded-full overflow-hidden"><motion.div initial={{ width: 0 }} animate={{ width: `${((currentQuestionIndex + 1) / quizQuestions.length) * 100}%` }} className="h-full bg-blue-500" /></div>
                  </div>
                  <div className="bg-white/5 border border-white/10 rounded-[3rem] p-10 space-y-10">
                    <div className="text-center space-y-4">
                      <h3 className="text-4xl font-black text-white leading-tight">{quizQuestions[currentQuestionIndex].question}</h3>
                      <div className="inline-block px-6 py-2 bg-purple-500/20 text-purple-300 rounded-full font-bold text-lg">Hint: {quizQuestions[currentQuestionIndex].kannadaHint}</div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {quizQuestions[currentQuestionIndex].options.map((option) => (
                        <button key={option} disabled={!!selectedOption} onClick={() => handleQuizAnswer(option)}
                          className={`p-6 rounded-3xl text-xl font-bold transition-all border-2 text-left flex justify-between items-center ${
                            selectedOption === option ? (isCorrect ? 'bg-green-500/20 border-green-500 text-green-400' : 'bg-red-500/20 border-red-500 text-red-400')
                            : selectedOption && option === quizQuestions[currentQuestionIndex].correctAnswer ? 'bg-green-500/20 border-green-500 text-green-400'
                            : 'bg-white/5 border-white/10 hover:bg-white/10 text-purple-200'}`}>
                          {option}
                          {selectedOption === option && (isCorrect ? <CheckCircle className="w-6 h-6" /> : <Info className="w-6 h-6" />)}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'profile' && (
            <motion.div key="profile" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="space-y-8">
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <footer className="py-20 text-center space-y-4">
        <div className="flex justify-center gap-6 text-purple-400/40">
          <Languages className="w-6 h-6" /><Book className="w-6 h-6" /><CheckCircle className="w-6 h-6" />
        </div>
        <div className="text-purple-400/60 font-medium">
          <p>© 2026 ಕಲೆ-NANDU Platform • English for Kannada Medium</p>
          <p className="text-xs mt-2 uppercase tracking-widest opacity-50">Built by Sudeep</p>
        </div>
      </footer>
    </div>
  );
}
