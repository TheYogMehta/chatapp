import React, { useState } from "react";
import styled from "styled-components";
import { Search, ArrowLeft } from "lucide-react";

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

const GifItem = styled.img`
  width: 100%;
  height: 100px;
  object-fit: cover;
  border-radius: 6px;
  cursor: pointer;
  transition: transform 0.2s;

  &:hover {
    transform: scale(1.05);
  }
`;

const DISCORD_TRENDING =
  "https://discord.com/api/v9/gifs/trending?provider=tenor&locale=en-US&media_format=mp4";
const DISCORD_SEARCH =
  "https://discord.com/api/v9/gifs/search?provider=tenor&locale=en-US&media_format=mp4&q=";

interface GifPickerProps {
  onSelect: (url: string) => void;
  onClose: () => void;
}

interface GifResult {
  url: string;
  preview: string;
}

interface GifCategory {
  name: string;
  src: string;
}

interface TrendingData {
  categories: GifCategory[];
}

let trendingCache: TrendingData | null = null;
const searchCache = new Map<string, GifResult[]>();

export const GifPicker: React.FC<GifPickerProps> = ({ onSelect, onClose }) => {
  const [search, setSearch] = useState("");
  const [gifs, setGifs] = useState<GifResult[]>([]);
  const [categories, setCategories] = useState<GifCategory[]>([]);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<"categories" | "gifs">("categories");
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        onClose();
      }
    };

    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEsc);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [onClose]);

  React.useEffect(() => {
    const fetchGifs = async () => {
      if (search.trim().length === 0) {
        if (trendingCache) {
          setCategories(trendingCache.categories);
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
            const result: TrendingData = { categories: parsedCategories };
            trendingCache = result;
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

      if (searchCache.has(search)) {
        setGifs(searchCache.get(search)!);
        setView("gifs");
        return;
      }

      setLoading(true);
      try {
        const res = await fetch(DISCORD_SEARCH + encodeURIComponent(search));
        if (!res.ok) throw new Error("Failed to search");
        const data = await res.json();

        let results: GifResult[] = [];
        if (Array.isArray(data)) {
          results = data.map((g: any) => ({
            url: g.gif_src || g.src || g.url,
            preview: g.gif_src || g.src || g.url,
          }));
        } else if (data?.gifs) {
          results = data.gifs.map((g: any) => ({
            url: g.gif_src || g.src || g.url,
            preview: g.gif_src || g.src || g.url,
          }));
        }

        searchCache.set(search, results);
        setGifs(results);
        setView("gifs");
      } catch (e) {
        console.error("Failed to search GIFs", e);
      } finally {
        setLoading(false);
      }
    };

    const timer = setTimeout(fetchGifs, 500);
    return () => clearTimeout(timer);
  }, [search]);

  const handleCategoryClick = async (category: string) => {
    setLoading(true);
    setView("gifs");

    if (searchCache.has(category)) {
      setGifs(searchCache.get(category)!);
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(DISCORD_SEARCH + encodeURIComponent(category));
      if (!res.ok) throw new Error("Failed to fetch category");
      const data = await res.json();

      let results: GifResult[] = [];
      if (Array.isArray(data)) {
        results = data.map((g: any) => ({
          url: g.gif_src || g.src || g.url,
          preview: g.gif_src || g.src || g.url,
        }));
      } else if (data?.gifs) {
        results = data.gifs.map((g: any) => ({
          url: g.gif_src || g.src || g.url,
          preview: g.gif_src || g.src || g.url,
        }));
      }

      searchCache.set(category, results);
      setGifs(results);
    } catch (e) {
      console.error("Failed to fetch category gifs", e);
    } finally {
      setLoading(false);
    }
  };

  const CategoryItem = styled.div`
    position: relative;
    height: 100px;
    border-radius: 6px;
    overflow: hidden;
    cursor: pointer;
    transition: transform 0.2s;

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
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
        />
      </SearchBar>
      <Content>
        {loading && (
          <div
            style={{
              color: "#aaa",
              gridColumn: "span 2",
              textAlign: "center",
              padding: "20px",
            }}
          >
            Loading...
          </div>
        )}

        {!loading &&
          view === "categories" &&
          categories.map((cat, i) => (
            <CategoryItem key={i} onClick={() => handleCategoryClick(cat.name)}>
              <CategoryVideo src={cat.src} autoPlay loop muted playsInline />
              <CategoryName>{cat.name}</CategoryName>
            </CategoryItem>
          ))}

        {!loading && view === "gifs" && gifs.length === 0 && (
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
          gifs.map((gif, i) => (
            <GifItem
              key={i}
              src={gif.preview}
              onClick={() => {
                onSelect(gif.url);
                onClose();
              }}
            />
          ))}
      </Content>
    </PickerContainer>
  );
};
