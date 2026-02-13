import React, { useState, useEffect, useRef, useCallback } from "react";
import styled from "styled-components";
import { Search, ArrowLeft, Loader2 } from "lucide-react";

const PickerContainer = styled.div`
  width: 320px;
  height: 400px;
  background: #1a1a1a;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: absolute;
  bottom: 60px;
  right: 20px;
  z-index: 1000;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
`;

const SearchBar = styled.div`
  padding: 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  align-items: center;
  gap: 8px;
`;

const Input = styled.input`
  background: rgba(255, 255, 255, 0.05);
  border: none;
  border-radius: 6px;
  padding: 8px 12px;
  color: white;
  flex: 1;
  outline: none;

  &:focus {
    background: rgba(255, 255, 255, 0.1);
  }
`;

const Content = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 8px;
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
`;

const GifImage = styled.img`
  width: 100%;
  height: 100px;
  object-fit: cover;
  border-radius: 6px;
  cursor: pointer;
  transition: transform 0.2s;
  background: #2a2a2a;

  &:hover {
    transform: scale(1.05);
  }
`;

const CategoryItem = styled.div`
  position: relative;
  height: 100px;
  border-radius: 6px;
  overflow: hidden;
  cursor: pointer;
  transition: transform 0.2s;
  background: #2a2a2a;

  &:hover {
    transform: scale(1.05);
  }
`;

const CategoryVideo = styled.video`
  width: 100%;
  height: 100%;
  object-fit: cover;
`;

const CategoryName = styled.div`
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  color: white;
  font-weight: bold;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.8);
  font-size: 1.1rem;
  width: 100%;
  text-align: center;
  pointer-events: none;
`;

const BackBtn = styled.button`
  background: none;
  border: none;
  color: #aaa;
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;

  &:hover {
    color: white;
  }
`;

const DISCORD_TRENDING =
  "https://discord.com/api/v9/gifs/trending?provider=tenor&locale=en-US&media_format=mp4";
const DISCORD_SEARCH =
  "https://discord.com/api/v9/gifs/search?provider=tenor&locale=en-US&media_format=mp4&q=";

const CACHE_KEY_PREFIX = "gif_cache_";
const CACHE_EXPIRY = 24 * 60 * 60 * 1000;

interface GifResult {
  url: string;
  preview: string;
  dims?: number[];
}

interface GifCategory {
  name: string;
  src: string;
}

interface CacheData<T> {
  timestamp: number;
  data: T;
}

const getFromCache = <T,>(key: string): T | null => {
  try {
    const item = localStorage.getItem(CACHE_KEY_PREFIX + key);
    if (!item) return null;
    const parsed: CacheData<T> = JSON.parse(item);
    if (Date.now() - parsed.timestamp > CACHE_EXPIRY) {
      localStorage.removeItem(CACHE_KEY_PREFIX + key);
      return null;
    }
    return parsed.data;
  } catch (e) {
    return null;
  }
};

const saveToCache = <T,>(key: string, data: T) => {
  try {
    const cacheItem: CacheData<T> = {
      timestamp: Date.now(),
      data,
    };
    localStorage.setItem(CACHE_KEY_PREFIX + key, JSON.stringify(cacheItem));
  } catch (e) {
    console.warn("Failed to save to cache", e);
  }
};

interface GifPickerProps {
  onSelect: (url: string) => void;
  onClose: () => void;
}

const LazyGifItem: React.FC<{
  src: string;
  url: string;
  onSelect: (url: string) => void;
}> = ({ src, url, onSelect }) => {
  const imgRef = useRef<HTMLImageElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsVisible(true);
            observer.disconnect();
          }
        });
      },
      { rootMargin: "50px" },
    );

    if (imgRef.current) {
      observer.observe(imgRef.current);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <GifImage
      ref={imgRef}
      src={isVisible ? src : ""}
      alt="gif"
      onClick={() => onSelect(url)}
      style={{ opacity: isVisible ? 1 : 0.5, transition: "opacity 0.3s" }}
      referrerPolicy="no-referrer"
    />
  );
};

const LazyCategoryItem: React.FC<{
  category: GifCategory;
  onClick: (name: string) => void;
}> = ({ category, onClick }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsVisible(true);
            observer.disconnect();
          }
        });
      },
      { rootMargin: "50px" },
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <CategoryItem ref={containerRef} onClick={() => onClick(category.name)}>
      {isVisible && (
        <CategoryVideo src={category.src} autoPlay loop muted playsInline />
      )}
      <CategoryName>{category.name}</CategoryName>
    </CategoryItem>
  );
};

export const GifPicker: React.FC<GifPickerProps> = ({ onSelect, onClose }) => {
  const [search, setSearch] = useState("");
  const [gifs, setGifs] = useState<GifResult[]>([]);
  const [categories, setCategories] = useState<GifCategory[]>([]);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<"categories" | "gifs">("categories");
  const containerRef = useRef<HTMLDivElement>(null);

  const [displayedGifs, setDisplayedGifs] = useState<GifResult[]>([]);
  const [page, setPage] = useState(1);
  const ITEMS_PER_PAGE = 20;
  const loadMoreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        onClose();
      }
    };

    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [onClose]);

  useEffect(() => {
    const fetchContent = async () => {
      // 1. Trending Categories
      if (search.trim().length === 0) {
        const cached = getFromCache<GifCategory[]>("trending_cats");
        if (cached) {
          setCategories(cached);
          setView("categories");
          return;
        }

        setLoading(true);
        try {
          const res = await fetch(DISCORD_TRENDING);
          if (!res.ok) throw new Error("Failed to fetch trending");
          const data = await res.json();

          if (data?.categories) {
            const parsedCategories = data.categories.map((c: any) => ({
              name: c.name,
              src: c.src,
            }));

            saveToCache("trending_cats", parsedCategories);
            setCategories(parsedCategories);
            setView("categories");
          }
        } catch (e) {
          console.error("Failed to fetch trending", e);
        } finally {
          setLoading(false);
        }
        return;
      }

      // 2. Search
      const cachedSearch = getFromCache<GifResult[]>(`search_${search}`);
      if (cachedSearch) {
        setGifs(cachedSearch);
        setView("gifs");
        setPage(1);
        setDisplayedGifs(cachedSearch.slice(0, ITEMS_PER_PAGE));
        return;
      }

      setLoading(true);
      try {
        const res = await fetch(DISCORD_SEARCH + encodeURIComponent(search));
        if (!res.ok) throw new Error("Failed to search");
        const data = await res.json();

        let results: GifResult[] = [];
        const rawItems = Array.isArray(data) ? data : data?.gifs || [];

        results = rawItems
          .filters((i: any) => i?.gif_src)
          .map((g: any) => ({
            url: g.gif_src,
            preview: g.gif_src,
            dims: g.dim,
          }));

        saveToCache(`search_${search}`, results);
        setGifs(results);
        setView("gifs");
        setPage(1);
        setDisplayedGifs(results.slice(0, ITEMS_PER_PAGE));
      } catch (e) {
        console.error("Failed to search GIFs", e);
      } finally {
        setLoading(false);
      }
    };

    const timer = setTimeout(fetchContent, 500);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (view !== "gifs" || loading) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          if (displayedGifs.length < gifs.length) {
            setPage((prev) => prev + 1);
          }
        }
      },
      { threshold: 0.5 },
    );

    if (loadMoreRef.current) {
      observer.observe(loadMoreRef.current);
    }
    return () => observer.disconnect();
  }, [displayedGifs.length, gifs.length, view, loading]);

  useEffect(() => {
    if (view === "gifs" && gifs.length > 0) {
      const nextItems = gifs.slice(0, page * ITEMS_PER_PAGE);
      setDisplayedGifs(nextItems);
    }
  }, [page, gifs, view]);

  const handleCategoryClick = async (category: string) => {
    setLoading(true);
    setView("gifs");
    setSearch(category);
  };

  const handleManualSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
  };

  return (
    <PickerContainer ref={containerRef} onClick={(e) => e.stopPropagation()}>
      <SearchBar>
        {view === "gifs" && search === "" && (
          <BackBtn onClick={() => setView("categories")}>
            <ArrowLeft size={16} />
          </BackBtn>
        )}
        <Search size={16} color="#aaa" />
        <Input
          placeholder="Search GIFs..."
          value={search}
          onChange={handleManualSearchChange}
          autoFocus
        />
      </SearchBar>
      <Content>
        {loading && (
          <div
            style={{
              gridColumn: "span 2",
              display: "flex",
              justifyContent: "center",
              padding: "20px",
            }}
          >
            <Loader2 className="animate-spin" color="#aaa" />
          </div>
        )}

        {!loading &&
          view === "categories" &&
          categories.map((cat, i) => (
            <LazyCategoryItem
              key={cat.name + i}
              category={cat}
              onClick={handleCategoryClick}
            />
          ))}

        {!loading && view === "gifs" && displayedGifs.length === 0 && (
          <div
            style={{
              color: "#aaa",
              gridColumn: "span 2",
              textAlign: "center",
              padding: "20px",
            }}
          >
            No results
          </div>
        )}

        {!loading &&
          view === "gifs" &&
          displayedGifs.map((gif, i) => (
            <LazyGifItem
              key={gif.url + i}
              src={gif.preview}
              url={gif.url}
              onSelect={(url) => {
                onSelect(url);
                onClose();
              }}
            />
          ))}

        {/* Sentinel for infinite scroll */}
        {view === "gifs" && displayedGifs.length < gifs.length && (
          <div
            ref={loadMoreRef}
            style={{ height: "20px", gridColumn: "span 2" }}
          />
        )}
      </Content>
    </PickerContainer>
  );
};
