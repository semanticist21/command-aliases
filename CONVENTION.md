# Code Conventions

이 문서는 Kobbokkom Forum 프로젝트의 코드 컨벤션을 정의합니다.

## Type System

### 타입 사용 규칙

- **Never use `any` type**: `unknown` 또는 `never` 사용
- **No barrel files**: 특정 파일에서 직접 import, `index.ts` re-export 금지
- **DB types are source of truth**: `DbPost`, `DbComment` 직접 사용 - 프론트엔드 타입 매핑 금지
- **Type imports**: `verbatimModuleSyntax` 활성화 시 `import type` 사용

## Code Organization

### 파일 및 폴더 구조

- **File names**: 항상 kebab-case 사용 (예: `user-profile.tsx`, `auth-modal.tsx`)
- **Flat structure**: 중첩된 폴더보다 평평한 파일 구조 선호
- **No enums**: type union 사용 (예: `type DbCategory = 'bugs' | 'improvements' | 'features'`)
- **One component per file**: 컴포넌트를 집중되고 분리된 상태로 유지

## React Patterns

### 컴포넌트 작성 규칙

- **React Compiler enabled**: `useMemo`, `useCallback`, `React.memo` 사용 금지
  - 예외: `useMemo`는 비용이 큰 연산(대용량 배열 필터링/정렬)에만 허용
  - 컴파일러가 자동으로 리렌더링 최적화
- **Inline handlers**: 짧고 단일 용도 핸들러는 인라인으로 정의
- **Comments in Korean**: 코드 주석은 한국어로 작성

## Data Fetching & State Management

### Query 패턴

- **useSuspenseQuery 우선**: 컴포넌트는 `useSuspenseQuery` 사용, `useQuery` 지양
- **Suspense & ErrorBoundary 분리**: 데이터 가져오는 컴포넌트와 static UI 분리
  - Static UI (검색바, 버튼 등): Suspense 밖에서 항상 표시
  - Dynamic content (데이터 목록): Suspense/ErrorBoundary로 감싸기
- **Loading/Error 컴포넌트 분리**: `-loading.tsx`, `-error.tsx` 파일로 분리

### Service Layer 규칙

- **절대 DB 함수 직접 호출 금지**: 컴포넌트에서 DB 함수나 supabase 직접 호출 금지
  - 올바른 흐름: `DB Layer` → `Service Layer (queryOptions)` → `Components`
  - 컴포넌트는 `queryOptions`를 `useSuspenseQuery`, `useQuery`에 직접 사용
- **Query Hook 금지**: `useQuery`/`useSuspenseQuery` 래핑하는 커스텀 훅 만들지 말 것
  - ❌ 잘못된 예시: `export function useUserProfile(userId: string) { return useQuery(getUserProfileQueryOptions(userId)); }`
  - ✅ 올바른 예시: 컴포넌트에서 직접 `const {data} = useSuspenseQuery(getUserProfileQueryOptions(userId))`
- **Mutation Hook 위치**: `useMutation` 훅은 `src/services/query/`에만 존재
  - `useMutation`은 캐시 무효화 로직이 복잡하므로 서비스 레이어에서 관리
  - Mutation 훅은 `queryClient`를 파라미터로 받음
  - 컴포넌트에서 `useQueryClient()`로 queryClient 가져와서 mutation 훅에 전달
- **Event Handler 인라인화**: 재사용하지 않는 핸들러는 인라인으로 정의

### 컴포넌트 구조 패턴

```typescript
// ❌ 잘못된 예시
function ArticleDetail() {
  const {data, isLoading, error} = useQuery(...);  // useQuery 사용

  // 컴포넌트 내부에서 직접 supabase 호출
  const user = await supabase.auth.getUser();
  const profile = await getUserProfile(user.id);  // DB 함수 직접 호출

  // 재사용 안하는 핸들러를 함수로 분리
  const handleClick = () => {...};

  if (isLoading) return <Loading />;
  if (error) return <Error />;
  return <div onClick={handleClick}>...</div>;
}

// ✅ 올바른 예시
// 1. 데이터 가져오는 컴포넌트 분리
function ArticleDetailContent() {
  const {data: article} = useSuspenseQuery(getPostByIdQueryOptions(articleId));
  const {user} = useLoginStore();
  const {data: profile} = useSuspenseQuery(getUserProfileQueryOptions(user?.id ?? ''));

  return (
    <div
      onClick={() => {  // 인라인 핸들러
        // 재사용 안하는 로직은 바로 여기에
      }}
    >
      {article.title}
    </div>
  );
}

// 2. Suspense/ErrorBoundary로 감싸기
function ArticleDetail() {
  return (
    <>
      {/* Static UI - 항상 표시 */}
      <SearchBar />
      <Button>New Post</Button>

      {/* Dynamic content - Suspense로 감싸기 */}
      <ErrorBoundary FallbackComponent={ArticleDetailError}>
        <Suspense fallback={<ArticleDetailLoading />}>
          <ArticleDetailContent />
        </Suspense>
      </ErrorBoundary>
    </>
  );
}
```

## Database & Service Layer

### DB 함수 작성 규칙

- **Verb-noun naming**: 모든 DB 함수는 동사-명사 형식 (예: `get-posts.ts`, `create-post.ts`)
- **One function per file**: `src/services/db/`에 각 DB 함수를 별도 파일로 작성
- **Re-export from index**: `src/services/db/index.ts`에서 재export하여 편의성 제공

### Service Layer 패턴

```typescript
// src/services/query/posts-service.ts
export function getPostsQueryOptions(category?: DbCategory, searchQuery?: string) {
  return queryOptions({
    queryKey: ['posts', category ?? 'all', searchQuery ?? ''] as const,
    queryFn: async () => {
      return await getPosts({ category, searchQuery }); // Returns DbPost[] directly
    },
    staleTime: 30 * 1000,
  });
}

export function useCreatePost(queryClient: QueryClient) {
  return useMutation({
    ...createPostMutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: ['posts']});
    },
  });
}

// Component usage - Query
function ArticleList() {
  const {data: posts = []} = useQuery(getPostsQueryOptions(category, searchQuery));
  // posts is DbPost[] - use snake_case fields: post.comments_count, post.author_name
}

// Component usage - Mutation
function CreatePostForm() {
  const queryClient = useQueryClient();
  const createPostMutation = useCreatePost(queryClient);

  const handleSubmit = () => {
    createPostMutation.mutate({title, content, category});
  };
}
```

### Field Naming

- **DB uses snake_case**: `comments_count`, `likes_count`, `author_name`, `post_id`, `created_at`
- **Components use DB field names directly**: camelCase 변환 금지

## Styling

### Tailwind CSS

- **Class merging**: 항상 `cn()` 유틸리티를 사용하여 클래스 병합

### Component Library

- **Shadcn UI**: UI 요소의 기본 라이브러리
- **Neo-brutalism**: 굵은 테두리, 단색 그림자, 높은 대비

## Quality Checks

### 코드 변경 후 필수 실행

1. `bun tsgo` - 타입 체킹
2. `bun lint` - 린팅 및 포맷팅

### Biome Configuration

**Formatting:**
- Single quotes for strings
- ES5 trailing commas
- No bracket spacing
- Auto-organize imports on save

**Disabled Lint Rules:**
- `noImportantStyles`: `!important` 허용 (Tailwind overrides용)
- `noUnknownTypeSelector`: View Transitions pseudo-elements 허용 (`:view-transition-*`)
- `noNonNullAssertion`: 타입을 알 때 `!` 연산자 허용
- `noUnknownAtRules`: 최신 CSS at-rules 허용

## Important Reminders

- **Type-only imports**: `verbatimModuleSyntax`가 활성화되어 있으므로 타입에는 `import type` 사용
- **Generated files**: `src/routeTree.gen.ts` 절대 수정 금지
- **Translations**: UI 텍스트 제거 시 `src/locales/en.json`, `src/locales/ko.json` 정리
- **Site config**: 하드코딩된 문자열 대신 `src/config/site-config.ts`의 `siteConfig.name` 사용
- **HTML5**: 시맨틱 HTML 및 접근성 모범 사례 준수
