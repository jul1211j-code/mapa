import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://kwfhfpkqfwusahrsqvms.supabase.co' // <-- pega aquí
const supabaseKey = 'sb_publishable_TeQXSLx7kYsYcqzQ7D8TNQ_Y7D80f34' // <-- pega aquí

export const supabase = createClient(supabaseUrl, supabaseKey)
