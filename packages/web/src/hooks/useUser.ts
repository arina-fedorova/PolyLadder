import { useQuery } from '@tanstack/react-query';
import { User } from '@/types';

// Placeholder API function (to be implemented in F023)
async function fetchCurrentUser(): Promise<User> {
  const response = await fetch('/api/auth/me', {
    headers: {
      Authorization: `Bearer ${localStorage.getItem('accessToken')}`,
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch user');
  }

  return response.json() as Promise<User>;
}

export function useUser() {
  return useQuery({
    queryKey: ['user', 'me'],
    queryFn: fetchCurrentUser,
    // Don't refetch automatically
    staleTime: Infinity,
    // Only fetch when we have a token
    enabled: !!localStorage.getItem('accessToken'),
  });
}
