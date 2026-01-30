// app/index.js
import { Redirect } from 'expo-router';
import { useAuth } from '../src/context/AuthContext';
import React from 'react';

export default function Index() {
    const { user } = useAuth();

    return user
        ? <Redirect href="/appGroup/home" />
        : <Redirect href="/authGroup/login" />;
}
