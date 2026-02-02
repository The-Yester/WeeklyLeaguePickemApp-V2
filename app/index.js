// app/index.js
import { Redirect } from 'expo-router';
import { useAuth } from '../src/context/AuthContext';
import React from 'react';

export default function Index() {
    return <Redirect href="/authGroup/login" />;
}
