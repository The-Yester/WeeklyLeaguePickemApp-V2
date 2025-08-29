// app/index.tsx
import { Redirect } from 'expo-router';
import { useAuth } from '../src/context/AuthContext';

export default function Index() {
  const { user } = useAuth();

  return user
    ? <Redirect href="/appGroup/home" />
    : <Redirect href="/authGroup/login" />;
}